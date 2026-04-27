import {Project} from "../domain/project";

export function createDefaultProject() {
    const project = new Project();
    project.projectName = "default-project";
    project.lockDate = new Date('2020-01-01T00:00:00.000Z').valueOf();
    project.addLockVersion('jquery', '3.0.0');
    return project;
}
