export interface RegistryVariable {
  id: string;
  key: string;
  value: string;
}

export interface SavedRegistryList {
  id: string;
  name: string;
  variables: RegistryVariable[];
  createdAt: number;
  updatedAt: number;
}

export interface ArchivedRegistryVariable {
  id: string;
  variable: RegistryVariable;
  deletedAt: number;
  source: 'active' | 'vault';
  collectionId?: string;
  collectionName?: string;
}

export const VARIABLE_REGISTRY_STORAGE_KEY = 'aimana_prompt_manager_variable_registry_v1';
export const VARIABLE_REGISTRY_LISTS_STORAGE_KEY = 'aimana_prompt_manager_variable_registry_lists_v1';
export const ARCHIVED_VARIABLE_REGISTRY_STORAGE_KEY = 'aimana_prompt_manager_variable_registry_deleted_v1';

const sortLists = (lists: SavedRegistryList[]) => [...lists].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
const sortArchivedVariables = (entries: ArchivedRegistryVariable[]) => [...entries].sort((a, b) => (b.deletedAt || 0) - (a.deletedAt || 0));

export const readRegistryVariables = (): RegistryVariable[] => {
  try {
    const raw = localStorage.getItem(VARIABLE_REGISTRY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RegistryVariable[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((variable) => (
      !!variable
      && typeof variable.id === 'string'
      && typeof variable.key === 'string'
      && typeof variable.value === 'string'
    ));
  } catch {
    return [];
  }
};

export const writeRegistryVariables = (variables: RegistryVariable[]) => {
  localStorage.setItem(VARIABLE_REGISTRY_STORAGE_KEY, JSON.stringify(variables));
};

export const readSavedRegistryLists = (): SavedRegistryList[] => {
  try {
    const raw = localStorage.getItem(VARIABLE_REGISTRY_LISTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedRegistryList[];
    if (!Array.isArray(parsed)) return [];
    return sortLists(parsed.filter((entry) => (
      !!entry
      && typeof entry.id === 'string'
      && typeof entry.name === 'string'
      && Array.isArray(entry.variables)
    )));
  } catch {
    return [];
  }
};

export const writeSavedRegistryLists = (lists: SavedRegistryList[]) => {
  localStorage.setItem(VARIABLE_REGISTRY_LISTS_STORAGE_KEY, JSON.stringify(lists));
};

export const readArchivedRegistryVariables = (): ArchivedRegistryVariable[] => {
  try {
    const raw = localStorage.getItem(ARCHIVED_VARIABLE_REGISTRY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ArchivedRegistryVariable[];
    if (!Array.isArray(parsed)) return [];
    return sortArchivedVariables(parsed.filter((entry) => (
      !!entry
      && typeof entry.id === 'string'
      && typeof entry.deletedAt === 'number'
      && (entry.source === 'active' || entry.source === 'vault')
      && !!entry.variable
      && typeof entry.variable.id === 'string'
      && typeof entry.variable.key === 'string'
      && typeof entry.variable.value === 'string'
    )));
  } catch {
    return [];
  }
};

export const writeArchivedRegistryVariables = (entries: ArchivedRegistryVariable[]) => {
  localStorage.setItem(ARCHIVED_VARIABLE_REGISTRY_STORAGE_KEY, JSON.stringify(entries));
};
