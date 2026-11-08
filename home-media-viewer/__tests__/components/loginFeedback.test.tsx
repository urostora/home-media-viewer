import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import Login from '@/components/auth/login';
import { apiLogin } from '@/utils/frontend/dataSource/auth';
jest.mock('@/utils/frontend/dataSource/auth', () => ({ apiLogin: jest.fn() }));
beforeEach(() => jest.resetAllMocks());
it.each([
    'Too many login attempts. Try again in 60 seconds.',
    'Login unavailable. Please retry.',
    'Invalid email or password',
])('shows retry feedback without claiming authentication: %s', async (message) => {
    jest.mocked(apiLogin).mockRejectedValue(new Error(message));
    const authenticated = jest.fn();
    const { container } = render(<Login onUserAuthenticated={authenticated} />);
    fireEvent.change(container.querySelector('input[name="email"]')!, { target: { value: 'reader@example.invalid' } });
    fireEvent.change(container.querySelector('input[name="password"]')!, { target: { value: 'synthetic-only' } });
    fireEvent.submit(container.querySelector('form')!);
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(authenticated).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByDisplayValue('Log in')).toBeEnabled());
});
