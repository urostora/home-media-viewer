import { AuthData } from "../auth/authContext";
import Login from "../auth/login";

export interface LayoutNotLoggedInProps {
    onUserAuthenticated(ad: AuthData): void;
};

const LayoutNotLoggedIn = (props: LayoutNotLoggedInProps) => {
    return (<Login onUserAuthenticated={props.onUserAuthenticated} />);
}

export default LayoutNotLoggedIn;