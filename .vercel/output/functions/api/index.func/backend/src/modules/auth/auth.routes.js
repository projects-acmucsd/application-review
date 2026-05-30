import { Router } from 'express';
import { exchangeGoogleCode } from './auth.service.js';
export const authRouter = Router();
authRouter.post('/google/exchange', async (req, res, next) => {
    const body = req.body;
    if (!body.code || !body.redirectUri) {
        res.status(400).json({
            error: 'Missing code or redirectUri.',
        });
        return;
    }
    try {
        const session = await exchangeGoogleCode({
            code: body.code,
            redirectUri: body.redirectUri,
        });
        res.json(session);
    }
    catch (error) {
        next(error);
    }
});
//# sourceMappingURL=auth.routes.js.map