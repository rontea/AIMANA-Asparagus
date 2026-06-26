import { normalizeUserFacingError } from '../../utils/userFacingErrors';

export const normalizeBulkErrorMessage = (input?: string, fallback = 'Bulk synthesis failed.'): string => {
    return normalizeUserFacingError(String(input || fallback));
};

export const truncateBulkErrorMessage = (input?: string, maxLength = 160): string => {
    const value = normalizeBulkErrorMessage(input).trim();
    if (value.length <= maxLength) return value;
    return `${value.slice(0, maxLength - 1)}…`;
};
