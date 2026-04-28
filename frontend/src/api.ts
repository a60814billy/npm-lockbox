export interface ProjectSnapshot {
  projectName: string;
  lockDate: number;
  lockVersionList: Record<string, string>;
  ignoreVersionList: Record<string, string[]>;
}

interface ApiErrorBody {
  error?: string;
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init?.headers || {}),
    },
  });

  if (!response.ok) {
    const body = await readErrorBody(response);
    throw new Error(body.error || `${response.status} ${response.statusText}`);
  }

  return response.json();
}

async function requestProject(path: string, init?: RequestInit): Promise<ProjectSnapshot> {
  return requestJson<ProjectSnapshot>(path, init);
}

async function readErrorBody(response: Response): Promise<ApiErrorBody> {
  try {
    return await response.json();
  } catch (error) {
    return {};
  }
}

export function createProject(name: string, lockDate: string) {
  return requestProject('/projects', {
    method: 'POST',
    body: JSON.stringify({
      name,
      lockDate,
    }),
  });
}

export function getProjects() {
  return requestJson<ProjectSnapshot[]>('/projects');
}

export function getProject(projectName: string) {
  return requestProject(`/projects/${encodeURIComponent(projectName)}`);
}

export function updateLockDate(projectName: string, lockDate: string) {
  return requestProject(`/projects/${encodeURIComponent(projectName)}/lock-date`, {
    method: 'PUT',
    body: JSON.stringify({
      lockDate,
    }),
  });
}

export function setPackageMaxVersion(projectName: string, packageName: string, maxVersion: string) {
  return requestProject(
    `/projects/${encodeURIComponent(projectName)}/packages/${encodePackagePath(packageName)}/max-version`,
    {
      method: 'PUT',
      body: JSON.stringify({
        maxVersion,
      }),
    },
  );
}

function encodePackagePath(packageName: string) {
  return packageName
    .split('/')
    .filter((segment) => segment.length > 0)
    .map(encodeURIComponent)
    .join('/');
}
