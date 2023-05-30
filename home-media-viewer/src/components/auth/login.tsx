import { LoginRequestType } from "@/types/loginTypes";
import { apiLogin } from "@/utils/frontend/dataSource/auth";
import { FormEvent, useState } from "react";
import { AuthData } from "./authContext";


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

    return (<div className="LoginForm">
        <form onSubmit={onLoginRequest}>
            <>
                <label>Username</label>
                <input type="text" name="email" value="admin@admin.com" required />
            </>
            <>
                <label>Password</label>
                <input type="password" name="password" value="P4ssw0rd" required />
            </>
            <>
                <input type="submit" value="Log in" />
                {typeof errorMessage === 'string' ? <div className="errorMessage">{errorMessage}</div> : null }
            </>
        </form>
    </div>);
}

export default Login;