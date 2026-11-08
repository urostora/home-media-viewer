export const AUTH_RECHECK_EVENT = 'hmv:auth-recheck';

// A resource-level denial may only mean the user lost access to that resource.
// Let the layout recheck /api/me rather than assuming every 403 ends a session.
export const apiFetch = async (input: string, init?: RequestInit): Promise<Response> => {
    const response = await fetch(input, { ...init, credentials: 'same-origin' });
    if ((response.status === 401 || response.status === 403) && typeof window !== 'undefined') {
        window.dispatchEvent(new Event(AUTH_RECHECK_EVENT));
    }
    return response;
};
