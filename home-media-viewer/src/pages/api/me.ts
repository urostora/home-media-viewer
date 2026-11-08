import type { NextApiRequest, NextApiResponse } from 'next';

import { getApiResponse, getApiResponseWithData } from '@/utils/apiHelpers';
import { sessionExpiryData } from '@/utils/auth/serverSession';
import { withAuthenticatedRoute } from '@/utils/auth/authenticatedRoute';

import type { LoginResponseDataType } from '@/types/loginTypes';

const handler = async (req: NextApiRequest, res: NextApiResponse): Promise<void> => {
    const user = req.authenticatedUser;
    if (user === undefined || req.sessionExpiresOn === undefined) {
        res.status(403).send(getApiResponse({ ok: false, error: 'No user is authenticated' }));
        return;
    }

    res.send(
        getApiResponseWithData<LoginResponseDataType>({
            name: user.name,
            email: user.email,
            isAdmin: user.isAdmin,
            ...sessionExpiryData(req.sessionExpiresOn),
        }),
    );
};

export default withAuthenticatedRoute(handler);
