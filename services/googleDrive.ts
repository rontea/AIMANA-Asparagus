
// Real Google Drive API Service using GSI (Google Identity Services) and GAPI

// Support both process.env (Node/Compat) and import.meta.env (Vite)
const getEnv = (key: string) => {
    // @ts-ignore
    const processVal = typeof process !== 'undefined' ? process.env?.[key] : undefined;
    // @ts-ignore
    const viteVal = (import.meta as any).env?.[`VITE_${key}`];
    
    // Check direct key or VITE_ prefixed key in both sources
    return processVal || 
           // @ts-ignore
           (typeof process !== 'undefined' ? process.env?.[`VITE_${key}`] : undefined) ||
           viteVal || 
           (import.meta as any).env?.[key] || 
           '';
};

const CLIENT_ID = getEnv('GOOGLE_CLIENT_ID');
const API_KEY = getEnv('GOOGLE_API_KEY'); 
const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';
const SCOPES = 'https://www.googleapis.com/auth/drive.file openid email profile';

let tokenClient: any;
let gapiInited = false;
let gisInited = false;

// Helper to wait for scripts to load
const waitForGoogleScripts = () => {
    return new Promise<void>((resolve, reject) => {
        // If navigator is offline, reject immediately to save time
        if (!navigator.onLine) {
            reject("Offline: Cannot connect to Google Drive API.");
            return;
        }

        let attempts = 0;
        const check = () => {
            attempts++;
            if ((window as any).gapi && (window as any).google) {
                resolve();
            } else {
                if (attempts > 50) { // 5 seconds
                    reject("Google API scripts failed to load. Check your internet connection.");
                    return;
                }
                setTimeout(check, 100);
            }
        };
        check();
    });
};

export const googleDriveService = {
    isConfigured: () => {
        // Needs at least a Client ID to work
        return !!CLIENT_ID && CLIENT_ID !== 'your_client_id_here'; 
    },

    isSessionActive: () => {
        try {
            // Check if GAPI client exists and has a token
            const token = (window as any).gapi?.client?.getToken();
            return !!token;
        } catch (e) {
            return false;
        }
    },

    initialize: async () => {
        if (gapiInited && gisInited) return;
        
        if (!CLIENT_ID) {
            throw new Error("Missing GOOGLE_CLIENT_ID. Please configure .env file.");
        }
        
        await waitForGoogleScripts();

        // 1. Init GAPI Client
        await new Promise<void>((resolve, reject) => {
            (window as any).gapi.load('client', async () => {
                try {
                    await (window as any).gapi.client.init({
                        apiKey: API_KEY,
                        discoveryDocs: [DISCOVERY_DOC],
                    });
                    gapiInited = true;
                    resolve();
                } catch (e) {
                    console.error("GAPI Init Error", e);
                    reject(e);
                }
            });
        });

        // 2. Init GIS Token Client
        return new Promise<void>((resolve) => {
            tokenClient = (window as any).google.accounts.oauth2.initTokenClient({
                client_id: CLIENT_ID,
                scope: SCOPES,
                callback: (tokenResponse: any) => {
                    // Handled in authorize promise via override
                },
            });
            gisInited = true;
            resolve();
        });
    },

    authorize: async (): Promise<{email: string, name: string, avatar: string}> => {
        try {
            await googleDriveService.initialize();
        } catch (error: any) {
            console.error(error);
            throw new Error(error.message || "Unable to initialize Google Drive.");
        }

        return new Promise((resolve, reject) => {
            // Override callback for this specific request
            tokenClient.callback = async (resp: any) => {
                if (resp.error !== undefined) {
                    reject(resp);
                    return;
                }
                
                // CRITICAL: Set the access token for GAPI calls
                (window as any).gapi.client.setToken(resp);
                
                try {
                    // Fetch User Profile info manually since we have the token
                    const userInfoReq = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                        headers: { Authorization: `Bearer ${resp.access_token}` }
                    });
                    const userInfo = await userInfoReq.json();
                    
                    resolve({
                        email: userInfo.email,
                        name: userInfo.name,
                        avatar: userInfo.picture
                    });
                } catch (e) {
                    console.warn("Failed to fetch user info", e);
                    // Fallback if profile fetch fails but auth succeeded
                    resolve({ email: 'Google User', name: 'Google User', avatar: '' });
                }
            };

            // Request token (triggers popup)
            if ((window as any).google) {
                tokenClient.requestAccessToken({ prompt: 'consent' });
            } else {
                reject("Google Identity Services not loaded");
            }
        });
    },

    listFolders: async (): Promise<{id: string, name: string}[]> => {
        if (!gapiInited) await googleDriveService.initialize();
        
        try {
            const response = await (window as any).gapi.client.drive.files.list({
                'pageSize': 20,
                'fields': "nextPageToken, files(id, name)",
                'q': "mimeType = 'application/vnd.google-apps.folder' and trashed = false"
            });
            return response.result.files || [];
        } catch (e) {
            console.error("Drive List Error", e);
            throw e;
        }
    },

    createFolder: async (name: string): Promise<{id: string, name: string}> => {
        if (!gapiInited) await googleDriveService.initialize();

        try {
            const fileMetadata = {
                'name': name,
                'mimeType': 'application/vnd.google-apps.folder'
            };
            const response = await (window as any).gapi.client.drive.files.create({
                resource: fileMetadata,
                fields: 'id, name'
            });
            return { id: response.result.id, name: response.result.name };
        } catch (e) {
            console.error("Drive Create Error", e);
            throw e;
        }
    },

    uploadFile: async (file: File, folderId?: string): Promise<{id: string, webViewLink: string, webContentLink: string, thumbnailLink?: string}> => {
        if (!gapiInited) await googleDriveService.initialize();

        try {
            const metadata: any = {
                name: file.name,
                mimeType: file.type
            };
            if (folderId) {
                metadata.parents = [folderId];
            }

            // Multipart Upload
            const tokenObj = (window as any).gapi.client.getToken();
            if (!tokenObj) {
                throw new Error("Session expired. Please reconnect Drive.");
            }
            const accessToken = tokenObj.access_token;
            
            const form = new FormData();
            form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
            form.append('file', file);

            const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink,webContentLink,thumbnailLink', {
                method: 'POST',
                headers: new Headers({ 'Authorization': 'Bearer ' + accessToken }),
                body: form
            });

            if (response.status === 401) {
                throw new Error("Session expired. Please reconnect Drive.");
            }

            if (!response.ok) {
                let errorMessage = response.statusText;
                try {
                    const errorBody = await response.json();
                    if (errorBody.error && errorBody.error.message) {
                        errorMessage = errorBody.error.message;
                    }
                } catch (e) {
                    // ignore parse error, use statusText
                }
                throw new Error(`Drive: ${errorMessage}`);
            }

            let data = await response.json();

            // FALLBACK: If thumbnailLink is missing (async processing), wait and fetch metadata again
            if (!data.thumbnailLink) {
                console.log("Drive thumbnail not ready, waiting...");
                await new Promise(r => setTimeout(r, 2000)); // Wait 2s
                
                try {
                     const metaResponse = await (window as any).gapi.client.drive.files.get({
                        fileId: data.id,
                        fields: 'id,webViewLink,webContentLink,thumbnailLink'
                     });
                     if (metaResponse.result && metaResponse.result.thumbnailLink) {
                         data = metaResponse.result;
                         console.log("Drive thumbnail retrieved on retry.");
                     }
                } catch(e) {
                    console.warn("Failed to fetch retry metadata", e);
                }
            }

            return {
                id: data.id,
                webViewLink: data.webViewLink,
                webContentLink: data.webContentLink,
                thumbnailLink: data.thumbnailLink
            };

        } catch (e) {
            console.error("Drive Upload Error", e);
            throw e;
        }
    },

    deleteFile: async (fileId: string): Promise<void> => {
        if (!gapiInited) await googleDriveService.initialize();

        try {
            await (window as any).gapi.client.drive.files.delete({
                'fileId': fileId
            });
        } catch (e) {
            console.error("Drive Delete Error", e);
            throw e;
        }
    }
};
