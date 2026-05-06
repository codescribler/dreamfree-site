import { SignJWT, jwtVerify } from "jose";
function getSecret() {
    const secret = process.env.UNSUBSCRIBE_SIGNING_SECRET;
    if (!secret || secret.length < 32) {
        throw new Error("UNSUBSCRIBE_SIGNING_SECRET env var is missing or shorter than 32 chars");
    }
    return new TextEncoder().encode(secret);
}
export async function signUnsubscribeToken(payload) {
    return await new SignJWT({ ...payload })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setIssuer("dreamfree-email-campaigns")
        .sign(getSecret());
}
export async function verifyUnsubscribeToken(token) {
    try {
        const { payload } = await jwtVerify(token, getSecret(), {
            issuer: "dreamfree-email-campaigns",
        });
        if (typeof payload.enrollmentId === "string" &&
            typeof payload.draftId === "string") {
            return {
                enrollmentId: payload.enrollmentId,
                draftId: payload.draftId,
            };
        }
        return null;
    }
    catch {
        return null;
    }
}
