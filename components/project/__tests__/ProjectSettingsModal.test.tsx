import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectSettingsModal } from '../ProjectSettingsModal';
import { Project, ProjectStorageType, ProjectType } from '../../../types';

const { getProjectTypesMock } = vi.hoisted(() => ({
  getProjectTypesMock: vi.fn(async () => [])
}));

vi.mock('../../../services/projectTypes', () => ({
  getProjectTypes: getProjectTypesMock
}));

vi.mock('../../../services/api', () => ({
  api: {
    auth: {
      getUser: () => ({ id: 'user-1' })
    }
  }
}));

vi.mock('../IntentRegistryModal', () => ({
  IntentRegistryModal: () => null
}));

const makeProject = (overrides: Partial<Project> = {}): Project => ({
  id: 'project-1',
  name: 'Original Project',
  description: 'Original Description',
  storageType: ProjectStorageType.LOCAL_DRIVE,
  projectType: ProjectType.ALL,
  createdAt: 1,
  updatedAt: 1,
  color: '#1e293b',
  ...overrides
});

describe('ProjectSettingsModal', () => {
  beforeEach(() => {
    getProjectTypesMock.mockClear();
  });

  it('preserves local edits when parent rerenders same project id', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn(async () => {});
    const project = makeProject();
    const { rerender } = render(
      <ProjectSettingsModal
        isOpen={true}
        onClose={() => {}}
        project={project}
        onUpdate={onUpdate}
      />
    );

    const nameInput = screen.getByPlaceholderText('Project Name');
    await user.clear(nameInput);
    await user.type(nameInput, 'Draft Name');
    expect(nameInput).toHaveValue('Draft Name');

    rerender(
      <ProjectSettingsModal
        isOpen={true}
        onClose={() => {}}
        project={makeProject({ name: 'Parent Refetch Name', description: 'Parent Refetch Description' })}
        onUpdate={onUpdate}
      />
    );

    expect(nameInput).toHaveValue('Draft Name');
  });

  it('resets form when project id changes while open', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn(async () => {});
    const { rerender } = render(
      <ProjectSettingsModal
        isOpen={true}
        onClose={() => {}}
        project={makeProject()}
        onUpdate={onUpdate}
      />
    );

    const nameInput = screen.getByPlaceholderText('Project Name');
    await user.clear(nameInput);
    await user.type(nameInput, 'Draft Name');
    expect(nameInput).toHaveValue('Draft Name');

    rerender(
      <ProjectSettingsModal
        isOpen={true}
        onClose={() => {}}
        project={makeProject({ id: 'project-2', name: 'Second Project' })}
        onUpdate={onUpdate}
      />
    );

    await waitFor(() => expect(nameInput).toHaveValue('Second Project'));
  });
});
