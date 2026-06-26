export const normalizeRevisionStorage = (storage) => {
  if (typeof storage !== 'string') return storage;
  const value = storage.trim().toLowerCase();
  if (!value) return storage;

  if (
    value === 'local' ||
    value === 'local drive' ||
    value === 'local-drive' ||
    value === 'local_drive'
  ) {
    return 'local';
  }

  if (
    value === 'google-drive' ||
    value === 'google drive' ||
    value === 'google_drive' ||
    value === 'googledrive'
  ) {
    return 'google-drive';
  }

  return storage;
};
