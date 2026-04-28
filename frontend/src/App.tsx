import type {FormEvent, ReactNode} from 'react';
import {useEffect, useMemo, useState} from 'react';
import {
  BrowserRouter,
  Link,
  Navigate,
  Route,
  Routes,
  useNavigate,
  useParams,
} from 'react-router-dom';
import {
  clearLockDate,
  createProject,
  deletePackageMaxVersion,
  deleteProject,
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

function formatDate(timestamp: number | null) {
  if (timestamp === null) {
    return 'No lock date';
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(timestamp));
}

function packageLockCount(project: ProjectSnapshot) {
  return Object.keys(project.lockVersionList).length;
}

type ActionRunner = (actionName: string, action: () => Promise<void>) => void;

interface AppLayoutProps {
  children: ReactNode;
  loadingAction: string;
  error: string;
  message: string;
}

function AppLayout({children, loadingAction, error, message}: AppLayoutProps) {
  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">npm-lockbox</p>
          <h1>Registry projects</h1>
        </div>
        <div className="topbar-actions">
          <Link className="secondary-link" to="/ui/projects">
            Projects
          </Link>
          <Link className="primary-link" to="/ui/projects/new">
            New project
          </Link>
        </div>
      </header>

      <section className="status-row" aria-live="polite">
        <span className={loadingAction ? 'status-pill busy' : 'status-pill'}>
          {loadingAction || 'Ready'}
        </span>
        {error && <div className="notice error">{error}</div>}
        {message && <div className="notice success">{message}</div>}
      </section>

      {children}
    </main>
  );
}

interface ProjectListPageProps {
  loadingAction: string;
  runAction: ActionRunner;
}

function ProjectListPage({loadingAction, runAction}: ProjectListPageProps) {
  const [projects, setProjects] = useState<ProjectSnapshot[]>([]);

  useEffect(() => {
    void loadProjects();
  }, []);

  function loadProjects() {
    runAction('Refresh projects', async () => {
      setProjects(await getProjects());
    });
  }

  return (
    <section className="project-board page-panel" aria-labelledby="projects-title">
      <div className="section-heading">
        <div>
          <h2 id="projects-title">Projects</h2>
          <p>{projects.length} total</p>
        </div>
        <div className="heading-actions">
          <button className="secondary-button" disabled={loadingAction !== ''} onClick={loadProjects} type="button">
            Refresh
          </button>
          <Link className="primary-link compact-link" to="/ui/projects/new">
            New
          </Link>
        </div>
      </div>

      <div className="project-list">
        {projects.length > 0 ? (
          projects.map((project) => (
            <Link className="project-item" key={project.projectName} to={`/ui/projects/${encodeURIComponent(project.projectName)}`}>
              <span>
                <strong>{project.projectName}</strong>
                <small>{formatDate(project.lockDate)}</small>
              </span>
              <em>{packageLockCount(project)} locks</em>
            </Link>
          ))
        ) : (
          <p className="empty-state">No projects</p>
        )}
      </div>
    </section>
  );
}

interface NewProjectPageProps {
  loadingAction: string;
  runAction: ActionRunner;
}

function NewProjectPage({loadingAction, runAction}: NewProjectPageProps) {
  const navigate = useNavigate();
  const [projectName, setProjectName] = useState('');
  const [lockDate, setLockDate] = useState(toDateTimeInputValue(Date.now()));

  function handleCreateProject(event: FormEvent) {
    event.preventDefault();
    runAction('Create project', async () => {
      const nextProject = await createProject(projectName.trim(), toApiDate(lockDate));
      navigate(`/ui/projects/${encodeURIComponent(nextProject.projectName)}`);
    });
  }

  return (
    <section className="project-detail page-panel narrow-panel" aria-labelledby="new-project-title">
      <div className="section-heading">
        <div>
          <h2 id="new-project-title">New project</h2>
          <p>Create a registry workspace with its first lock date.</p>
        </div>
      </div>

      <form className="create-project-form standalone-form" onSubmit={handleCreateProject}>
        <label>
          Project name
          <input
            value={projectName}
            onChange={(event) => setProjectName(event.target.value)}
            placeholder="legacy-app"
            required
          />
        </label>
        <label>
          Lock date
          <input
            value={lockDate}
            onChange={(event) => setLockDate(event.target.value)}
            required
            type="datetime-local"
          />
        </label>
        <div className="form-actions">
          <Link className="secondary-link" to="/ui/projects">
            Cancel
          </Link>
          <button disabled={loadingAction !== ''} type="submit">
            Create project
          </button>
        </div>
      </form>
    </section>
  );
}

interface ProjectDetailPageProps {
  loadingAction: string;
  runAction: ActionRunner;
}

function ProjectDetailPage({loadingAction, runAction}: ProjectDetailPageProps) {
  const navigate = useNavigate();
  const {projectName = ''} = useParams();
  const decodedProjectName = decodeURIComponent(projectName);
  const [project, setProject] = useState<ProjectSnapshot | null>(null);
  const [detailLockDate, setDetailLockDate] = useState(toDateTimeInputValue(Date.now()));
  const [packageName, setPackageName] = useState('');
  const [maxVersion, setMaxVersion] = useState('');

  const projectLocks = useMemo(() => {
    return Object.entries(project?.lockVersionList || {})
      .sort(([leftName], [rightName]) => leftName.localeCompare(rightName));
  }, [project]);
  const registryUrl = project
    ? `${window.location.origin}/p/${encodeURIComponent(project.projectName)}/`
    : '';

  useEffect(() => {
    runAction('Load project', async () => {
      setProject(null);
      const nextProject = await getProject(decodedProjectName);
      setProject(nextProject);
      setDetailLockDate(nextProject.lockDate === null ? toDateTimeInputValue(Date.now()) : toDateTimeInputValue(nextProject.lockDate));
    });
  }, [decodedProjectName]);

  function replaceProject(nextProject: ProjectSnapshot) {
    setProject(nextProject);
    setDetailLockDate(nextProject.lockDate === null ? toDateTimeInputValue(Date.now()) : toDateTimeInputValue(nextProject.lockDate));
  }

  function handleUpdateLockDate(event: FormEvent) {
    event.preventDefault();
    if (!project) {
      return;
    }

    runAction('Update lock date', async () => {
      replaceProject(await updateLockDate(project.projectName, toApiDate(detailLockDate)));
    });
  }

  function handleClearLockDate() {
    if (!project) {
      return;
    }

    runAction('Clear lock date', async () => {
      replaceProject(await clearLockDate(project.projectName));
    });
  }

  function handleSetMaxVersion(event: FormEvent) {
    event.preventDefault();
    if (!project) {
      return;
    }

    runAction('Add package lock', async () => {
      replaceProject(await setPackageMaxVersion(project.projectName, packageName.trim(), maxVersion.trim()));
      setPackageName('');
      setMaxVersion('');
    });
  }

  function handleDeletePackageMaxVersion(name: string) {
    if (!project) {
      return;
    }

    runAction('Delete package lock', async () => {
      replaceProject(await deletePackageMaxVersion(project.projectName, name));
    });
  }

  function handleDeleteProject() {
    if (!project || !window.confirm(`Delete project "${project.projectName}"?`)) {
      return;
    }

    runAction('Delete project', async () => {
      await deleteProject(project.projectName);
      navigate('/ui/projects');
    });
  }

  return (
    <section className="project-detail page-panel" aria-labelledby="detail-title">
      <div className="section-heading">
        <div>
          <h2 id="detail-title">{project ? project.projectName : decodedProjectName}</h2>
          <p>{project ? `${packageLockCount(project)} package locks` : 'Loading project'}</p>
        </div>
        <button className="danger-button" disabled={loadingAction !== '' || !project} onClick={handleDeleteProject} type="button">
          Delete project
        </button>
      </div>

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
            <button className="secondary-button" disabled={loadingAction !== ''} onClick={handleClearLockDate} type="button">
              Clear date
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
                    <button
                      className="danger-button compact-button"
                      disabled={loadingAction !== ''}
                      onClick={() => handleDeletePackageMaxVersion(name)}
                      type="button"
                    >
                      Delete
                    </button>
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
          <strong>Loading project</strong>
        </div>
      )}
    </section>
  );
}

function RoutedApp() {
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loadingAction, setLoadingAction] = useState('');

  function runAction(actionName: string, action: () => Promise<void>) {
    setLoadingAction(actionName);
    setError('');
    setMessage('');

    void action()
      .then(() => setMessage(`${actionName} complete`))
      .catch((actionError) => {
        setError(actionError instanceof Error ? actionError.message : String(actionError));
      })
      .finally(() => setLoadingAction(''));
  }

  return (
    <AppLayout loadingAction={loadingAction} error={error} message={message}>
      <Routes>
        <Route path="/" element={<Navigate replace to="/ui/projects" />} />
        <Route path="/ui/projects" element={<ProjectListPage loadingAction={loadingAction} runAction={runAction} />} />
        <Route path="/ui/projects/new" element={<NewProjectPage loadingAction={loadingAction} runAction={runAction} />} />
        <Route path="/ui/projects/:projectName" element={<ProjectDetailPage loadingAction={loadingAction} runAction={runAction} />} />
      </Routes>
    </AppLayout>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <RoutedApp />
    </BrowserRouter>
  );
}
