const functions = require("firebase-functions"),
    admin = require("firebase-admin");

admin.initializeApp();

const ALLOWED_REFERER = "https://whitecloudsbook.com";
const FILE_PREFIX = "White Clouds";
const FILE_EXPIRY = 3.6e+6; // = hour
//300000; //5 minutes

const getError = (code, text) => ({ error: { text, code } });

const getFileSignedUrl = (file) => {
    console.log("GOT FILE !!! ", file);

    return file.getSignedUrl({
        action: "read",
        expires: (Date.now() + FILE_EXPIRY)
    })
        .then((url) => {
            console.log(`"!!!!!!!! got signed url for ${(FILE_EXPIRY / 1000 / 60)} minutes`);
            return { url };
        });
};

const retrieveFileUrlFromStorage = (fileType) => {
    const defaultStorage = admin.storage(),
        bucket = defaultStorage.bucket();

    return bucket.getFiles({
        prefix: FILE_PREFIX,
        maxResults: 1,
    })
        .then((results) =>
            results.length && results[0].length ?
                getFileSignedUrl(results[0][0]) : //get the first file in the results
                getError(404, "no file for you!"));
};

const processRequest = (req) => {
    let result;
    console.log("about to check password for post request");

    const config = functions.config().whiteclouds;
    const ACCESS_PASSWORD = config.password;

    if (req.body.password === ACCESS_PASSWORD) {
        const fileType = req.body.type || "pdf";

        result = retrieveFileUrlFromStorage(fileType)
            .then((fileUrlResult) =>
                fileUrlResult.error ?
                    fileUrlResult : {
                        downloadUrl: fileUrlResult.url[0],
                    });
    }
    else {
        result = Promise.resolve(getError(401, "nope!"));
    }

    return result;
};

const getCorsHeaders = (isDev) => ({
    "Access-Control-Allow-Methods": "POST",
    "Access-Control-Allow-Origin": isDev ? "*" : ALLOWED_REFERER,
    "Access-Control-Allow-Headers": "content-type",
});

const replyWithError = (res, info, isDev) => {
    res.set(getCorsHeaders(isDev))
        .status(info.error.code)
        .send(info.error.text);
};

const returnResponse = (res, info, isDev) => {
    if (info.error) { //error
        replyWithError(res, info, isDev);
    }
    else if (info.preflight) { //options
        console.log("OPTIONS !!!! returning preflight response");

        res.set(getCorsHeaders(isDev))
            .status(204)
            .end();
    }
    else { //success
        console.log("FINISHED SUCCESSFULLY ! - result = ", info);

        res.set(getCorsHeaders(isDev))
            .send({
                success: true,
                status: "yay!",
                info: {
                    ...info,
                }
            })
    }
};

exports.whitecloudsShare = functions.https.onRequest((req, res) => {
    let result = null;

    const isDev = !req.hostname.indexOf("localhost");

    if (req.method === "POST") {
        const referer = req.get("referer") || "";

        if (isDev || !referer.indexOf(ALLOWED_REFERER)) { //only accept requests from whiteclouds.com domain
            result = processRequest(req);
        }
        else {
            console.log("REFERER CHECK FAILED - ", { referer, ALLOWED_REFERER });
            result = Promise.resolve(getError(401, "who are you?"));
        }
    }
    else if (req.method === "OPTIONS") {
        result = Promise.resolve({ preflight: true });
    }
    else {
        result = Promise.resolve(getError(404, "huh?"));
    }

    result
        .then((info) => returnResponse(res, info, isDev))
        .catch((err) => {
            console.error("!!!!! UNEXPECTED ERROR !!! ", err);
            replyWithError(res, getError(500, "something bad happened!"));
        });
});
