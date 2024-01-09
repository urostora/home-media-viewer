import { type FormEvent, useState } from "react";

import { apiLogin } from "@/utils/frontend/dataSource/auth";
import { type AuthData } from "./authContext";

import hmvStyle from '@/styles/hmv.module.scss';

interface LoginProps {
    onUserAuthenticated: (ad: AuthData) => void;
}

const Login = (props: LoginProps): JSX.Element => {
    const [ isOperationInProgress, setIsOperationInProgress ] = useState<boolean>(false);
    const [ errorMessage, setErrorMessage ] = useState<string | null>(null);

    const { onUserAuthenticated } = props;

    const onLoginRequest = (event: FormEvent): void => {
        event.preventDefault();

        const data = new FormData(event.currentTarget as HTMLFormElement);

        if (
            typeof data.get('email') !== 'string'
            || typeof data.get('password') !== 'string'
        ) {
            setErrorMessage('No email or password data provided');
            return;
        }

        setErrorMessage(null);
        setIsOperationInProgress(true);

        const requestData = {
            email: data.get('email') as string ?? '',
            password: data.get('password') as string ?? '',
        }

        apiLogin(requestData)
        .then(result => {
            if (result === null) {
                setErrorMessage('Invalid email or password');
                return;
            }

            onUserAuthenticated({
                isLoggedIn: true,
                ...result
            });
        }).catch(e => {
            if (typeof e === 'string')
                setErrorMessage(e);
            else
                setErrorMessage('Invalid email or password');
        })
        .finally(() => {
            setIsOperationInProgress(false);
        });
    }

    return (<div className={hmvStyle.loginForm}>
        <div className={hmvStyle.loginTitle}>HMV</div>
        <form onSubmit={onLoginRequest}>
            <div className={hmvStyle.inputContainer}>
                <div>
                    <label>E-mail</label>
                    <input type="text" name="email" required />
                </div>
                <div>
                    <label>Password</label>
                    <input type="password" name="password" required />
                </div>
            </div>
            <div className={hmvStyle.controlContainer}>
                <input type="submit" className={`${hmvStyle.buttonElement} ${hmvStyle.primaryButton}`} value={isOperationInProgress ? 'Logging in...' : 'Log in'} disabled={isOperationInProgress} />
                {typeof errorMessage === 'string' ? <div className="errorMessage">{errorMessage}</div> : null }
            </div>
        </form>
    </div>);
}

export default Login;