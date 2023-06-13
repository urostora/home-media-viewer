import { LoginRequestType } from "@/types/loginTypes";
import { apiLogin } from "@/utils/frontend/dataSource/auth";
import { FormEvent, useState } from "react";
import { AuthData } from "./authContext";
import hmvStyle from '@/styles/hmv.module.scss';


interface LoginProps {
    onUserAuthenticated(ad: AuthData): void;
}

const Login = (props: LoginProps) => {
    const [ errorMessage, setErrorMessage ] = useState<string | null>(null);
    const [ isLoginInProgress, setIsLoginInProgress ] = useState<boolean>(false);

    const { onUserAuthenticated } = props;

    const onLoginRequest = async (event: FormEvent) => {
        event.preventDefault();

        console.log(event.currentTarget);
        const data = new FormData(event.currentTarget as HTMLFormElement) as any;

        if (
            typeof data.get('email') !== 'string'
            || typeof data.get('password') !== 'string'
        ) {
            setErrorMessage('No email or password data provided');
            return;
        }

        setErrorMessage(null);

        const requestData = {
            email: data.get('email'),
            password: data.get('password'),
        }

        try {
            const result = await apiLogin(requestData);

            if (result === null) {
                setErrorMessage('Invalid email or password');
                return;
            }

            onUserAuthenticated({
                isLoggedIn: true,
                ...result
            });
        } catch(e) {
            if (typeof e === 'string')
                setErrorMessage(e);
            else
                setErrorMessage('Invalid email or password');
        }
    }

    return (<div className={hmvStyle.loginForm}>
        <div className={hmvStyle.loginTitle}>Login</div>
        <form onSubmit={onLoginRequest}>
            <div className={hmvStyle.inputContainer}>
                <div>
                    <label>Username</label>
                    <input type="text" name="email" required />
                </div>
                <div>
                    <label>Password</label>
                    <input type="password" name="password" required />
                </div>
            </div>
            <div className={hmvStyle.controlContainer}>
                <input type="submit" value="Log in" />
                {typeof errorMessage === 'string' ? <div className="errorMessage">{errorMessage}</div> : null }
            </div>
        </form>
    </div>);
}

export default Login;