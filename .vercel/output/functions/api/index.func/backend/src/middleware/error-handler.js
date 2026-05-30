function getStatusCode(error) {
    if (error instanceof Error && 'statusCode' in error) {
        const statusCode = error.statusCode;
        if (typeof statusCode === 'number') {
            return statusCode;
        }
    }
    return 500;
}
function hasExplicitStatusCode(error) {
    return (error instanceof Error &&
        'statusCode' in error &&
        typeof error.statusCode === 'number');
}
export function errorHandler(error, _req, res, next) {
    void next;
    const message = error instanceof Error ? error.message : 'Unexpected server error';
    const statusCode = getStatusCode(error);
    if (hasExplicitStatusCode(error)) {
        const log = statusCode >= 500 ? console.error : console.warn;
        log(`[${statusCode}] ${message}`);
    }
    else {
        console.error(error);
    }
    res.status(statusCode).json({
        error: message,
    });
}
//# sourceMappingURL=error-handler.js.map