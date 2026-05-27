export interface ApplicationSummary {
  id: string;
  applicantName: string;
  status: 'pending' | 'reviewed';
}

export async function listApplications(): Promise<ApplicationSummary[]> {
  return [];
}
