import type { Server as HttpServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import type { RawData } from 'ws';
import { WebSocket, WebSocketServer } from 'ws';

import { env } from '../../config/env.js';
import {
  REVIEWER_COMMENTS_FIELD,
  type CollaborationClientMessage,
  type CollaborationReviewer,
  type CollaborationServerMessage,
} from './collaboration.types.js';

interface ClientState {
  applicationId: string | null;
  connectionId: string;
  joinedAt: string;
  reviewerId: string | null;
  reviewerName: string | null;
  socket: WebSocket;
}

const COLLABORATION_PATH = '/ws/collaboration';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === 'string' && value.trim() ? value : null;
}

function parseMessage(raw: RawData): CollaborationClientMessage | null {
  const text = Array.isArray(raw)
    ? Buffer.concat(raw).toString('utf8')
    : raw.toString('utf8');

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }

  if (!isRecord(parsed)) {
    return null;
  }

  const type = readString(parsed, 'type');
  const applicationId = readString(parsed, 'applicationId');
  const reviewerId = readString(parsed, 'reviewerId');
  const reviewerName = readString(parsed, 'reviewerName');

  if (!type || !applicationId || !reviewerId || !reviewerName) {
    return null;
  }

  if (type === 'join_application') {
    return {
      type,
      applicationId,
      field:
        parsed.field === REVIEWER_COMMENTS_FIELD
          ? REVIEWER_COMMENTS_FIELD
          : undefined,
      reviewerId,
      reviewerName,
      value: typeof parsed.value === 'string' ? parsed.value : undefined,
      updatedAt:
        typeof parsed.updatedAt === 'string'
          ? parsed.updatedAt
          : new Date().toISOString(),
    };
  }

  if (type === 'leave_application') {
    return {
      type,
      applicationId,
      reviewerId,
      reviewerName,
      updatedAt:
        typeof parsed.updatedAt === 'string'
          ? parsed.updatedAt
          : new Date().toISOString(),
    };
  }

  if (type === 'comment_draft_update' || type === 'comment_saved') {
    const value = typeof parsed.value === 'string' ? parsed.value : null;
    const updatedAt = readString(parsed, 'updatedAt');

    if (parsed.field !== REVIEWER_COMMENTS_FIELD || value === null || !updatedAt) {
      return null;
    }

    return {
      type,
      applicationId,
      field: REVIEWER_COMMENTS_FIELD,
      reviewerId,
      reviewerName,
      value,
      updatedAt,
    };
  }

  return null;
}

function send(socket: WebSocket, message: CollaborationServerMessage) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

function sendError(socket: WebSocket, message: string) {
  send(socket, {
    type: 'error',
    message,
    updatedAt: new Date().toISOString(),
  });
}

function createPresenceMessage(
  applicationId: string,
  clients: Map<string, ClientState>,
): CollaborationServerMessage {
  const reviewers: CollaborationReviewer[] = Array.from(clients.values())
    .filter((client) => client.applicationId === applicationId)
    .filter(
      (client): client is ClientState & {
        reviewerId: string;
        reviewerName: string;
      } => Boolean(client.reviewerId && client.reviewerName),
    )
    .map((client) => ({
      connectionId: client.connectionId,
      reviewerId: client.reviewerId,
      reviewerName: client.reviewerName,
      joinedAt: client.joinedAt,
    }));

  return {
    type: 'presence_update',
    applicationId,
    reviewers,
    updatedAt: new Date().toISOString(),
  };
}

function broadcastPresence(
  applicationId: string | null,
  clients: Map<string, ClientState>,
) {
  if (!applicationId) {
    return;
  }

  const message = createPresenceMessage(applicationId, clients);
  for (const client of clients.values()) {
    if (client.applicationId === applicationId) {
      send(client.socket, message);
    }
  }
}

function broadcastToApplication(
  applicationId: string,
  clients: Map<string, ClientState>,
  message: CollaborationServerMessage,
  sourceConnectionId: string,
) {
  for (const client of clients.values()) {
    if (
      client.applicationId === applicationId &&
      client.connectionId !== sourceConnectionId
    ) {
      send(client.socket, message);
    }
  }
}

function handleJoin(
  state: ClientState,
  message: Extract<CollaborationClientMessage, { type: 'join_application' }>,
  clients: Map<string, ClientState>,
) {
  const previousApplicationId = state.applicationId;

  state.applicationId = message.applicationId;
  state.reviewerId = message.reviewerId;
  state.reviewerName = message.reviewerName;

  broadcastPresence(previousApplicationId, clients);
  broadcastPresence(message.applicationId, clients);
}

function handleLeave(
  state: ClientState,
  message: Extract<CollaborationClientMessage, { type: 'leave_application' }>,
  clients: Map<string, ClientState>,
) {
  if (state.applicationId !== message.applicationId) {
    return;
  }

  state.applicationId = null;
  state.reviewerId = null;
  state.reviewerName = null;
  broadcastPresence(message.applicationId, clients);
}

function handleCommentMessage(
  state: ClientState,
  message: Extract<
    CollaborationClientMessage,
    { type: 'comment_draft_update' | 'comment_saved' }
  >,
  clients: Map<string, ClientState>,
) {
  if (state.applicationId !== message.applicationId) {
    sendError(state.socket, 'Join the application room before broadcasting.');
    return;
  }

  broadcastToApplication(
    message.applicationId,
    clients,
    {
      type: message.type,
      applicationId: message.applicationId,
      field: message.field,
      reviewerId: message.reviewerId,
      reviewerName: message.reviewerName,
      value: message.value,
      updatedAt: message.updatedAt,
    },
    state.connectionId,
  );
}

export function createCollaborationServer(server: HttpServer) {
  const clients = new Map<string, ClientState>();
  const webSocketServer = new WebSocketServer({
    path: COLLABORATION_PATH,
    server,
  });

  webSocketServer.on('connection', (socket, request) => {
    const origin = request.headers.origin;
    if (origin && origin !== env.frontendOrigin) {
      socket.close(1008, 'Origin not allowed.');
      return;
    }

    const connectionId = randomUUID();
    const state: ClientState = {
      applicationId: null,
      connectionId,
      joinedAt: new Date().toISOString(),
      reviewerId: null,
      reviewerName: null,
      socket,
    };

    clients.set(connectionId, state);

    socket.on('message', (raw) => {
      const message = parseMessage(raw);

      if (!message) {
        sendError(socket, 'Invalid collaboration message.');
        return;
      }

      if (message.type === 'join_application') {
        handleJoin(state, message, clients);
        return;
      }

      if (message.type === 'leave_application') {
        handleLeave(state, message, clients);
        return;
      }

      handleCommentMessage(state, message, clients);
    });

    socket.on('close', () => {
      const previousApplicationId = state.applicationId;
      clients.delete(connectionId);
      broadcastPresence(previousApplicationId, clients);
    });
  });

  return webSocketServer;
}
