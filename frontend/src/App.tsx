import {FormEvent, useEffect, useMemo, useState} from 'react';
import {
  createProject,
  getProject,
  getProjects,
  ProjectSnapshot,
  setPackageMaxVersion,
  updateLockDate,
} from './api';

function toDateTimeInputValue(timestamp: number) {
  const date = new Date(timestamp);
  const timezoneOffset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - timezoneOffset).toISOString().slice(0, 16);
}

function toApiDate(dateTimeValue: string) {
  return new Date(dateTimeValue).toISOString();
}

function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(timestamp));
}

function packageLockCount(project: ProjectSnapshot) {
  return Object.keys(project.lockVersionList).length;
}

export function App() {
  const [projects, setProjects] = useState<ProjectSnapshot[]>([]);
  const [selectedProjectName, setSelectedProjectName] = useState('');
  const [project, setProject] = useState<ProjectSnapshot | null>(null);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectLockDate, setNewProjectLockDate] = useState(toDateTimeInputValue(Date.now()));
  const [detailLockDate, setDetailLockDate] = useState(toDateTimeInputValue(Date.now()));
  const [packageName, setPackageName] = useState('');
  const [maxVersion, setMaxVersion] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loadingAction, setLoadingAction] = useState('');

  const projectLocks = useMemo(() => {
    return Object.entries(project?.lockVersionList || {})
      .sort(([leftName], [rightName]) => leftName.localeCompare(rightName));
  }, [project]);
  const registryUrl = project
    ? `${window.location.origin}/p/${encodeURIComponent(project.projectName)}/`
    : '';

  useEffect(() => {
    let active = true;

    setLoadingAction('Loading projects');
    getProjects()
      .then((nextProjects) => {
        if (!active) {
          return;
        }

        setProjects(nextProjects);
        if (nextProjects.length > 0) {
          activateProject(nextProjects[0]);
        }
      })
      .catch((actionError) => {
        if (active) {
          setError(actionError instanceof Error ? actionError.message : String(actionError));
        }
      })
      .finally(() => {
        if (active) {
          setLoadingAction('');
        }
      });

    return () => {
      active = false;
    };
  }, []);

  function activateProject(nextProject: ProjectSnapshot) {
    setProject(nextProject);
    setSelectedProjectName(nextProject.projectName);
    setDetailLockDate(toDateTimeInputValue(nextProject.lockDate));
  }

  async function refreshProjects(activeProject?: ProjectSnapshot) {
    const nextProjects = await getProjects();
    setProjects(nextProjects);

    if (activeProject) {
      activateProject(activeProject);
      return;
    }

    if (selectedProjectName) {
      const currentProject = nextProjects.find((nextProject) => nextProject.projectName === selectedProjectName);
      if (currentProject) {
        activateProject(currentProject);
        return;
      }
    }

    if (nextProjects.length > 0) {
      activateProject(nextProjects[0]);
      return;
    }

    setProject(null);
    setSelectedProjectName('');
  }

  async function runAction(actionName: string, action: () => Promise<void>) {
    setLoadingAction(actionName);
    setError('');
    setMessage('');

    try {
      await action();
      setMessage(`${actionName} complete`);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : String(actionError));
    } finally {
      setLoadingAction('');
    }
  }

  function handleRefreshProjects() {
    void runAction('Refresh projects', () => refreshProjects());
  }

  function handleCreateProject(event: FormEvent) {
    event.preventDefault();
    void runAction('Create project', async () => {
      const nextProject = await createProject(newProjectName.trim(), toApiDate(newProjectLockDate));
      await refreshProjects(nextProject);
      setNewProjectName('');
    });
  }

  function handleSelectProject(projectNameToLoad: string) {
    void runAction('Load project', async () => {
      const nextProject = await getProject(projectNameToLoad);
      activateProject(nextProject);
    });
  }

  function handleUpdateLockDate(event: FormEvent) {
    event.preventDefault();
    if (!project) {
      return;
    }

    void runAction('Update lock date', async () => {
      const nextProject = await updateLockDate(project.projectName, toApiDate(detailLockDate));
      await refreshProjects(nextProject);
    });
  }

  function handleSetMaxVersion(event: FormEvent) {
    event.preventDefault();
    if (!project) {
      return;
    }

    void runAction('Add package lock', async () => {
      const nextProject = await setPackageMaxVersion(project.projectName, packageName.trim(), maxVersion.trim());
      await refreshProjects(nextProject);
      setPackageName('');
      setMaxVersion('');
    });
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">npm-lockbox</p>
          <h1>Registry projects</h1>
        </div>
        <div className="system-status">
          <span>Server</span>
          <strong>8080</strong>
        </div>
      </header>

      <section className="workspace">
        <section className="project-board" aria-labelledby="projects-title">
          <div className="section-heading">
            <div>
              <h2 id="projects-title">Projects</h2>
              <p>{projects.length} total</p>
            </div>
            <button className="secondary-button" disabled={loadingAction !== ''} onClick={handleRefreshProjects} type="button">
              Refresh
            </button>
          </div>

          <form className="create-project-form" onSubmit={handleCreateProject}>
            <label>
              Project name
              <input
                value={newProjectName}
                onChange={(event) => setNewProjectName(event.target.value)}
                placeholder="legacy-app"
                required
              />
            </label>
            <label>
              Lock date
              <input
                value={newProjectLockDate}
                onChange={(event) => setNewProjectLockDate(event.target.value)}
                required
                type="datetime-local"
              />
            </label>
            <button disabled={loadingAction !== ''} type="submit">
              Add project
            </button>
          </form>

          <div className="project-list">
            {projects.length > 0 ? (
              projects.map((listProject) => (
                <button
                  className={listProject.projectName === selectedProjectName ? 'project-item active' : 'project-item'}
                  key={listProject.projectName}
                  onClick={() => handleSelectProject(listProject.projectName)}
                  type="button"
                >
                  <span>
                    <strong>{listProject.projectName}</strong>
                    <small>{formatDate(listProject.lockDate)}</small>
                  </span>
                  <em>{packageLockCount(listProject)} locks</em>
                </button>
              ))
            ) : (
              <p className="empty-state">No projects</p>
            )}
          </div>
        </section>

        <section className="project-detail" aria-labelledby="detail-title">
          <div className="section-heading">
            <div>
              <h2 id="detail-title">{project ? project.projectName : 'Project detail'}</h2>
              <p>{project ? `${packageLockCount(project)} package locks` : 'No project selected'}</p>
            </div>
            <span className={loadingAction ? 'status-pill busy' : 'status-pill'}>
              {loadingAction || 'Ready'}
            </span>
          </div>

          {error && <div className="notice error">{error}</div>}
          {message && <div className="notice success">{message}</div>}

          {project ? (
            <>
              <div className="summary-grid">
                <div>
                  <span>Lock date</span>
                  <strong>{formatDate(project.lockDate)}</strong>
                </div>
                <div>
                  <span>Registry URL</span>
                  <code>{registryUrl}</code>
                </div>
              </div>

              <form className="inline-editor" onSubmit={handleUpdateLockDate}>
                <label>
                  Lock date
                  <input
                    value={detailLockDate}
                    onChange={(event) => setDetailLockDate(event.target.value)}
                    required
                    type="datetime-local"
                  />
                </label>
                <button disabled={loadingAction !== ''} type="submit">
                  Save date
                </button>
              </form>

              <div className="locks-section">
                <div className="section-heading compact">
                  <div>
                    <h3>Package locks</h3>
                    <p>Manual max versions</p>
                  </div>
                </div>

                <form className="package-lock-form" onSubmit={handleSetMaxVersion}>
                  <label>
                    Package
                    <input
                      value={packageName}
                      onChange={(event) => setPackageName(event.target.value)}
                      placeholder="@scope/package-name"
                      required
                    />
                  </label>
                  <label>
                    Max version
                    <input
                      value={maxVersion}
                      onChange={(event) => setMaxVersion(event.target.value)}
                      placeholder="4.0.0"
                      required
                    />
                  </label>
                  <button disabled={loadingAction !== ''} type="submit">
                    Add lock
                  </button>
                </form>

                <div className="lock-table">
                  {projectLocks.length > 0 ? (
                    projectLocks.map(([name, version]) => (
                      <div className="lock-row" key={name}>
                        <span>{name}</span>
                        <strong>{version}</strong>
                      </div>
                    ))
                  ) : (
                    <p className="empty-state">No package locks</p>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="detail-empty">
              <strong>No project selected</strong>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
