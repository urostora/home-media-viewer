import { type JSX, type FormEvent, useState } from 'react';

import { apiLogin } from '@/utils/frontend/dataSource/auth';
import { type AuthData } from './authContext';

import hmvStyle from '@/styles/hmv.module.scss';
import styles from '@/styles/shell.module.scss';
import ThemeSwitch from '@/components/layout/themeSwitch';
import TitleArea from '@/components/layout/titleArea';

interface LoginProps {
  onUserAuthenticated: (ad: AuthData) => void;
}

const Login = (props: LoginProps): JSX.Element => {
  const [isOperationInProgress, setIsOperationInProgress] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { onUserAuthenticated } = props;

  const onLoginRequest = (event: FormEvent): void => {
    event.preventDefault();

    const data = new FormData(event.currentTarget as HTMLFormElement);

    if (typeof data.get('email') !== 'string' || typeof data.get('password') !== 'string') {
      setErrorMessage('No email or password data provided');
      return;
    }

    setErrorMessage(null);
    setIsOperationInProgress(true);

    const requestData = {
      email: (data.get('email') as string) ?? '',
      password: (data.get('password') as string) ?? '',
    };

    apiLogin(requestData)
      .then((result) => {
        if (result === null) {
          setErrorMessage('Invalid email or password');
          return;
        }

        onUserAuthenticated({
          isLoggedIn: true,
          ...result,
        });
      })
      .catch((e) => {
        if (e instanceof Error) setErrorMessage(e.message);
        else if (typeof e === 'string') setErrorMessage(e);
        else setErrorMessage('Invalid email or password');
      })
      .finally(() => {
        setIsOperationInProgress(false);
      });
  };

  return (
    <main id="main-content" className={styles.loginPage}>
      <div className={styles.loginPanel}>
        <div className={styles.loginBrand}>
          <TitleArea />
        </div>
        <div className={styles.loginCard}>
          <h1>Welcome home.</h1>
          <p>Sign in to explore your photos and videos.</p>
          <form onSubmit={onLoginRequest}>
            <div>
              <div className={styles.field}>
                <label htmlFor="login-email">E-mail</label>
                <input id="login-email" type="text" inputMode="email" autoComplete="username" name="email" required />
              </div>
              <div className={styles.field}>
                <label htmlFor="login-password">Password</label>
                <input id="login-password" type="password" autoComplete="current-password" name="password" required />
              </div>
            </div>
            <div>
              <input
                type="submit"
                className={`${hmvStyle.buttonElement} ${hmvStyle.primaryButton}`}
                value={isOperationInProgress ? 'Logging in...' : 'Log in'}
                disabled={isOperationInProgress}
              />
              {typeof errorMessage === 'string' ? (
                <div className="errorMessage" role="alert">
                  {errorMessage}
                </div>
              ) : null}
            </div>
          </form>
        </div>
        <div className={styles.loginTheme}>
          <ThemeSwitch />
        </div>
      </div>
    </main>
  );
};

export default Login;
