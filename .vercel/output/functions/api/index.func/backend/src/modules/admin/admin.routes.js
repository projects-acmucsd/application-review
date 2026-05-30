import { Router } from 'express';
import { readBearerToken } from '../auth/google-auth.js';
import { updateApplicationSourceSettings, updateReviewDueDate, } from '../settings/settings.service.js';
import { bulkAssignApplications, bulkClearAssignments, deleteAssignment, getAdminStatus, listAssignments, listReviewerOptions, upsertAssignment, } from './admin.service.js';
export const adminRouter = Router();
adminRouter.get('/me', async (req, res, next) => {
    try {
        const status = await getAdminStatus(readBearerToken(req));
        res.json(status);
    }
    catch (error) {
        next(error);
    }
});
adminRouter.get('/reviewers', async (req, res, next) => {
    try {
        const reviewers = await listReviewerOptions(readBearerToken(req));
        res.json({ data: reviewers });
    }
    catch (error) {
        next(error);
    }
});
adminRouter.get('/assignments', async (req, res, next) => {
    try {
        const assignments = await listAssignments(readBearerToken(req));
        res.json({ data: assignments });
    }
    catch (error) {
        next(error);
    }
});
adminRouter.put('/settings/review', async (req, res, next) => {
    const body = req.body;
    if (!body.dueDate) {
        res.status(400).json({
            error: 'Missing dueDate.',
        });
        return;
    }
    try {
        const settings = await updateReviewDueDate({
            accessToken: readBearerToken(req),
            dueDate: body.dueDate,
        });
        res.json({ data: settings });
    }
    catch (error) {
        next(error);
    }
});
adminRouter.put('/settings/application-source', async (req, res, next) => {
    const body = req.body;
    if (!body.spreadsheetUrl) {
        res.status(400).json({
            error: 'Missing spreadsheetUrl.',
        });
        return;
    }
    try {
        const settings = await updateApplicationSourceSettings({
            accessToken: readBearerToken(req),
            spreadsheetUrl: body.spreadsheetUrl,
            sheetName: body.sheetName,
            clearCurrentData: body.clearCurrentData === true,
        });
        res.json({ data: settings });
    }
    catch (error) {
        next(error);
    }
});
adminRouter.post('/assignments/bulk', async (req, res, next) => {
    const body = req.body;
    if (!body.assigneeEmail) {
        res.status(400).json({
            error: 'Missing assigneeEmail.',
        });
        return;
    }
    if (!Array.isArray(body.applicationIds) ||
        !body.applicationIds.every((applicationId) => typeof applicationId === 'string')) {
        res.status(400).json({
            error: 'Missing applicationIds.',
        });
        return;
    }
    try {
        const assignments = await bulkAssignApplications({
            accessToken: readBearerToken(req),
            assignment: {
                applicationIds: body.applicationIds,
                assigneeEmail: body.assigneeEmail,
                assigneeName: body.assigneeName ?? body.assigneeEmail,
            },
        });
        res.json({ data: assignments });
    }
    catch (error) {
        next(error);
    }
});
adminRouter.post('/assignments/bulk-clear', async (req, res, next) => {
    const body = req.body;
    if (!Array.isArray(body.applicationIds) ||
        !body.applicationIds.every((applicationId) => typeof applicationId === 'string')) {
        res.status(400).json({
            error: 'Missing applicationIds.',
        });
        return;
    }
    try {
        const applicationIds = await bulkClearAssignments({
            accessToken: readBearerToken(req),
            applicationIds: body.applicationIds,
        });
        res.json({ data: applicationIds });
    }
    catch (error) {
        next(error);
    }
});
adminRouter.put('/assignments/:applicationId', async (req, res, next) => {
    const body = req.body;
    if (!body.assigneeEmail) {
        res.status(400).json({
            error: 'Missing assigneeEmail.',
        });
        return;
    }
    try {
        const assignment = await upsertAssignment({
            accessToken: readBearerToken(req),
            applicationId: req.params.applicationId,
            assignment: {
                assigneeEmail: body.assigneeEmail,
                assigneeName: body.assigneeName ?? body.assigneeEmail,
            },
        });
        res.json({ data: assignment });
    }
    catch (error) {
        next(error);
    }
});
adminRouter.delete('/assignments/:applicationId', async (req, res, next) => {
    try {
        await deleteAssignment({
            accessToken: readBearerToken(req),
            applicationId: req.params.applicationId,
        });
        res.status(204).send();
    }
    catch (error) {
        next(error);
    }
});
//# sourceMappingURL=admin.routes.js.map