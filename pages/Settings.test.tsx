import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import Settings from './Settings';

const mockNavigate = vi.fn();
const mockGetUser = vi.fn();
const mockGetSettings = vi.fn();
const mockUseAppUpdate = vi.fn();

vi.mock('react-router', () => ({
    useNavigate: () => mockNavigate
}));

vi.mock('../services/privilegedAuth', () => ({
    privilegedAuth: {
        isAuthorized: vi.fn(() => true),
        authenticate: vi.fn()
    }
}));

vi.mock('../services/api', () => ({
    api: {
        auth: {
            getUser: () => mockGetUser()
        },
        settings: {
            get: () => mockGetSettings(),
            update: vi.fn(),
            verifyTotp: vi.fn(),
            verifyPin: vi.fn()
        }
    }
}));

vi.mock('../hooks/useAppUpdate', () => ({
    useAppUpdate: () => mockUseAppUpdate()
}));

vi.mock('../components/settings/AuthenticatorSection', () => ({
    AuthenticatorSection: () => <div>Authenticator Section</div>
}));

vi.mock('../components/settings/ProtectionSection', () => ({
    ProtectionSection: () => <div>Protection Section</div>
}));

vi.mock('../components/settings/UserSection', () => ({
    UserSection: () => <div>Users Section</div>
}));

vi.mock('../components/settings/PolicySection', () => ({
    PolicySection: () => <div>Policies Section</div>
}));

vi.mock('../components/settings/LicenseSection', () => ({
    LicenseSection: () => <div>License Section</div>
}));

vi.mock('../components/settings/VoiceSection', () => ({
    VoiceSection: () => <div>Voice Reader Section</div>
}));

vi.mock('../components/settings/VerificationOverlay', () => ({
    VerificationOverlay: () => null
}));

vi.mock('../components/SecurityChallengeModal', () => ({
    default: () => <div>Security Challenge</div>
}));

describe('Settings update section', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetSettings.mockResolvedValue({
            isTwoFactorEnabled: false,
            isTwoFactorLoginEnabled: false,
            isTwoFactorRequiredForDelete: true,
            maxUsers: 5,
            inactivityTimeout: 0,
            aiEngines: [],
            isPinProtectionEnabled: false,
            isItemProtectionEnabled: false,
            bulkLimit: 8,
            manualPollenHourlyRate: 0.15,
            defaultReadAloudVoiceURI: '',
            defaultReadAloudVoiceName: ''
        });
        mockUseAppUpdate.mockReturnValue({
            currentVersion: '0.16.99-dev',
            latestVersion: '0.16.99',
            checkedAt: Date.now(),
            isChecking: false,
            updateAvailable: true,
            error: null,
            refresh: vi.fn()
        });
    });

    it('shows the client update nav item and section for the super user above About AIMANA', async () => {
        mockGetUser.mockReturnValue({
            id: 'admin-root',
            role: 'admin',
            name: 'Root',
            email: 'root@aimana.local'
        });

        render(<Settings />);

        const clientUpdateMatches = await screen.findAllByText('Client Update');
        expect(clientUpdateMatches.length).toBeGreaterThanOrEqual(2);
        expect(screen.getByText('About AIMANA')).toBeInTheDocument();

        const sectionHeading = clientUpdateMatches[1];
        const aboutHeading = screen.getByText('About AIMANA');
        const position = sectionHeading.compareDocumentPosition(aboutHeading);

        expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('hides the client update nav item and section for non-super users', async () => {
        mockGetUser.mockReturnValue({
            id: 'admin-1',
            role: 'admin',
            name: 'Admin',
            email: 'admin@aimana.local'
        });

        render(<Settings />);

        await waitFor(() => {
            expect(screen.getByText('About AIMANA')).toBeInTheDocument();
        });

        expect(screen.queryByText('Client Update')).not.toBeInTheDocument();
    });
});
