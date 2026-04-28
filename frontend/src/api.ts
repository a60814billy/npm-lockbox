export interface ProjectSnapshot {
  projectName: string;
  lockDate: number | null;
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

  const text = await response.text();
  if (text.length === 0) {
    return undefined as T;
  }

  return JSON.parse(text) as T;
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
  return requestProject('/api/v1/projects', {
    method: 'POST',
    body: JSON.stringify({
      name,
      lockDate,
    }),
  });
}

export function getProjects() {
  return requestJson<ProjectSnapshot[]>('/api/v1/projects');
}

export function getProject(projectName: string) {
  return requestProject(`/api/v1/projects/${encodeURIComponent(projectName)}`);
}

export function updateLockDate(projectName: string, lockDate: string) {
  return requestProject(`/api/v1/projects/${encodeURIComponent(projectName)}/lock-date`, {
    method: 'PUT',
    body: JSON.stringify({
      lockDate,
    }),
  });
}

export function clearLockDate(projectName: string) {
  return requestProject(`/api/v1/projects/${encodeURIComponent(projectName)}/lock-date`, {
    method: 'DELETE',
  });
}

export function deleteProject(projectName: string) {
  return requestJson<void>(`/api/v1/projects/${encodeURIComponent(projectName)}`, {
    method: 'DELETE',
  });
}

export function setPackageMaxVersion(projectName: string, packageName: string, maxVersion: string) {
  return requestProject(
    `/api/v1/projects/${encodeURIComponent(projectName)}/packages/${encodePackagePath(packageName)}/max-version`,
    {
      method: 'PUT',
      body: JSON.stringify({
        maxVersion,
      }),
    },
  );
}

export function deletePackageMaxVersion(projectName: string, packageName: string) {
  return requestProject(
    `/api/v1/projects/${encodeURIComponent(projectName)}/packages/${encodePackagePath(packageName)}/max-version`,
    {
      method: 'DELETE',
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
