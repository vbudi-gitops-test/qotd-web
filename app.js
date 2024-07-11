if (process.env.ENABLE_INSTANA == "true") {
    require('@instana/collector')();
}
require('dotenv').config();

const express = require('express');
const fs = require('fs');
const requestIp = require('request-ip');
const moment = require('moment');
const parseUrl = require('parse-url');
const faker = require('faker');
const serviceManager = require('@quote-of-the-day/service-control');

var utils = serviceManager.utils;

USE_REQ_TOKEN = true;
if (typeof process.env.USE_REQ_TOKEN != 'undefined') {
    USE_REQ_TOKEN = (process.env.USE_REQ_TOKEN == 'true' || process.env.USE_REQ_TOKEN == 'True');
}

QUOTE_SVC = process.env.QUOTE_SVC;
AUTHOR_SVC = process.env.AUTHOR_SVC;
RATING_SVC = process.env.RATING_SVC;
PDF_SVC = process.env.PDF_SVC;
ENGRAVING_SVC = process.env.ENGRAVING_SVC;
QRCODE_SVC = process.env.QRCODE_SVC;
HIDE_IMAGE = false;
if( typeof process.env.HIDE_IMAGE != "undefined" ){
    HIDE_IMAGE = (typeof process.env.HIDE_IMAGE == "undefined");
}

BRANDING=null;
if( typeof process.env.BRANDING == "string" && process.env.BRANDING.length>0  ){
    BRANDING = process.env.BRANDING;
}

//================================================================================================
// Express setup

app = express();

app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
app.set('port', 3000);

app.enable('trust proxy');

app.use(express.static(__dirname + '/public'));
app.use(express.json());
app.use(requestIp.mw());

//================================================================================================
// simulated user / web page data

var data = fs.readFileSync('./users.json');
const USERS = JSON.parse(data);

function newLocalSession() {
    var index = randomInt(USERS.length);
    var user = USERS[index];
    var token = utils.intBetween(100000, 999999);
    return { "token": token, "user": user, "appName": appName, "appVersion": appVersion, "buildInfo": buildInfo };
}

//================================================================================================
// service management

const anomalyConfig = { 
    "url": process.env.ANOMALY_GENERATOR_URL,
    "logLevel": process.env.LOG_LEVEL
}

if( typeof process.env.POLLING_FREQUENCY != 'undefined' && Number.parseInt(process.env.POLLING_FREQUENCY) ) {
    anomalyConfig.pollingFrequency = parseInt(process.env.POLLING_FREQUENCY);
} else {
    anomalyConfig.pollingFrequency = 5000;
}

serviceManager.config(anomalyConfig, app);

utils = serviceManager.utils;


//================================================================================================
// Instana web app token

const INSTANA_REPORTING_URL = process.env.INSTANA_REPORTING_URL;
const INSTANA_ENUM_MIN_JS_URL = process.env.INSTANA_ENUM_MIN_JS_URL;
const INSTANA_KEY = process.env.INSTANA_KEY;
var INSTANA_HEADER = "";

function getInstanaSnippet(req){
    if (typeof INSTANA_REPORTING_URL != 'undefined' && INSTANA_REPORTING_URL != ""
    && typeof INSTANA_ENUM_MIN_JS_URL != 'undefined' && INSTANA_ENUM_MIN_JS_URL != ""
    && typeof INSTANA_KEY != 'undefined' && INSTANA_KEY != "") {

        var traceId = req.get('x-instana-t');

        INSTANA_HEADER =
            `<script>\n` +
            `  (function(s,t,a,n){s[t]||(s[t]=a,n=s[a]=function(){n.q.push(arguments)},\n` +
            `  n.q=[],n.v=2,n.l=1*new Date)})(window,"InstanaEumObject","ineum");\n` +
            `  ineum('reportingUrl', '${INSTANA_REPORTING_URL}');\n` +
            `  ineum('key', '${INSTANA_KEY}');\n` +
            `  ineum('trackSessions');\n` +
            `  ineum('traceId','${traceId}');\n` +
            `</script>\n` +
            `<script defer crossorigin="anonymous" src="${INSTANA_ENUM_MIN_JS_URL}"></script>\n`;
            return INSTANA_HEADER;
    }    
}

// if (typeof INSTANA_REPORTING_URL != 'undefined' && INSTANA_REPORTING_URL != ""
//     && typeof INSTANA_ENUM_MIN_JS_URL != 'undefined' && INSTANA_ENUM_MIN_JS_URL != ""
//     && typeof INSTANA_KEY != 'undefined' && INSTANA_KEY != "") {

//     INSTANA_HEADER =
//         `<script>\n` +
//         `  (function(s,t,a,n){s[t]||(s[t]=a,n=s[a]=function(){n.q.push(arguments)},\n` +
//         `  n.q=[],n.v=2,n.l=1*new Date)})(window,"InstanaEumObject","ineum");\n` +
//         `  ineum('reportingUrl', '${INSTANA_REPORTING_URL}');\n` +
//         `  ineum('key', '${INSTANA_KEY}');\n` +
//         `  ineum('trackSessions');\n` +
//         `</script>\n` +
//         `<script defer crossorigin="anonymous" src="${INSTANA_ENUM_MIN_JS_URL}"></script>\n`;
// }

//================================================================================================
// Endpoints 


function getQuote(id,localSession ){
    return new Promise((resolve, reject) => { 
        var parsedUrl = parseUrl(process.env.QUOTE_SVC);
        var hostname = parsedUrl.resource;
        var port = 80;
        if (parsedUrl.port != null) port = parsedUrl.port;  

        utils.log("Requesting quote " + id + ".", localSession.token , "INFO");

        const options = {
            "headers": { "Accept": "application/json" },
            "method": 'GET',
            "hostname": hostname,
            "port": port,
            "path": '/quotes/' + id + '?requestToken=' + localSession.token ,
            "timeout": 5000
        }

        utils.httpRequest(options)
        .then( (quote) => {
            utils.log("Quote service request for quote details sucessfull ["+id+"].", localSession.token , "INFO");
            resolve(quote);
        })
        .catch( (error) => {
            utils.log("Problem submitting quote service quote request. Error: " + error.message, localSession.token , "INFO");
            var errObj = {
                "error": 'Rejecting quote service.  Status: ' + error.statusCode,
                "resource": `http://${options.hostname}:${options.port}${options.path}`
            }
            reject(errObj);
        });
    });
}

function getRating(id,localSession ){
    return new Promise((resolve, reject) => { 

        var parsedUrl = parseUrl(process.env.RATING_SVC);
        var hostname = parsedUrl.resource;
        var port = 80;
        if (parsedUrl.port != null) port = parsedUrl.port;  

        utils.log("Requesting rating for quote " + id + ".", localSession.token , "INFO");

        const options = {
            "headers": { "Accept": "application/json" },
            "method": 'GET',
            "hostname": hostname,
            "port": port,
            "path": '/ratings/' + id + '?requestToken=' + localSession.token ,
            "timeout": 5000
        }

        utils.httpRequest(options)
        .then( (quote) => {
            utils.log("Rating service request for quote "+id+".", localSession.token , "INFO");
            resolve(quote);
        })
        .catch( (error) => {
            utils.log("Problem getting rating. Error: " + error.message, localSession.token , "INFO");
            var errObj = {
                "error": 'Rejecting rating service.  Status: ' + error.statusCode,
                "resource": `http://${options.hostname}:${options.port}${options.path}`
            }
            reject(errObj);
        });
    });
}

const ENABLE_ENGRAVING = (typeof ENGRAVING_SVC != 'undefined' && ENGRAVING_SVC != "");
const ENABLE_QRCODE = (typeof QRCODE_SVC != 'undefined' && QRCODE_SVC != "");


function handleDaily(req,res){
    var ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    var localSession  = newLocalSession();
    utils.log('Starting new request token. Incoming for IP: ' + ip, localSession.token , "INFO");
    utils.log('Web request: /', localSession.token , "INFO");

    var now = new moment();
    var quote_id = now.dayOfYear();
    var quoteDetails = {
        "id": quote_id,
        "today": now.format("dddd, MMMM Do YYYY"),
        "title": "Quote of the Day",
        "enableOrdering": ENABLE_ENGRAVING,
        "enableQR": ENABLE_QRCODE
    }

    getQuote(quote_id, localSession )
    .then( (quote) => {
        quoteDetails.quote = quote.quote;
        quoteDetails.genre = quote.genre;
        quoteDetails.author = quote.author;
        quoteDetails.author_id = quote.author_id;

        getRating(quote_id, localSession )
        .then( (rating) => {
            quoteDetails.rating = rating.rating;
            utils.log("Obtained rating for quote: "+quote_id+".", localSession.token , "INFO");
            var instanaHeader = getInstanaSnippet(req);
            res.render('home', { "quoteDetails": quoteDetails, "branding" : BRANDING, "INSTANA_HEADER": instanaHeader, "pageid": "daily", "localSession": localSession });
        })
        .catch( error => {
            quoteDetails.rating = "Rating service currently unavailable.";
            var instanaHeader = getInstanaSnippet(req);
            utils.log("Error obtaining rating for quote "+quote_id+" Error: "+error, localSession.token , "WARN");
            res.render('home', { "quoteDetails": quoteDetails, "branding" : BRANDING, "INSTANA_HEADER": instanaHeader, "pageid": "daily", "localSession": localSession });
        })

    })
    .catch( (error) => {
        quoteDetails.quote = "Error obtaining quote.  Please try again.";
        quoteDetails.genre = "";
        quoteDetails.author = "";
        quoteDetails.author_id = "";
        quoteDetails.rating = "";
        utils.log("Error obtaining quote: " + quote_id + ". " + error, localSession.token , "WARN");
        var instanaHeader = getInstanaSnippet(req);
        res.render('home', { "quoteDetails": quoteDetails, "branding" : BRANDING, "INSTANA_HEADER": instanaHeader, "pageid": "daily", "localSession": localSession });
    });

}

serviceManager.endpointGet('/', "Processing daily quote request", handleDaily);

function handleRandom(req,res){
    var ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    var localSession  = newLocalSession();
    utils.log('Starting new request token. Incoming for IP: ' + ip, localSession.token , "INFO");
    utils.log('Web request: /random', localSession.token , "INFO");

    var quote_id = utils.intBetween(1,500);
    var quoteDetails = {
        "id": quote_id,
        "today": "Random Quote",
        "title": "Quote of the Day",
        "enableOrdering": ENABLE_ENGRAVING,
        "enableQR": ENABLE_QRCODE
    }

    getQuote(quote_id, localSession )
    .then( (quote) => {
        quoteDetails.quote = quote.quote;
        quoteDetails.genre = quote.genre;
        quoteDetails.author = quote.author;
        quoteDetails.author_id = quote.author_id;

        getRating(quote_id, localSession )
        .then( (rating) => {
            quoteDetails.rating = rating.rating;
            utils.log("Obtained rating for quote: "+quote_id+".", localSession.token , "INFO");
            var instanaHeader = getInstanaSnippet(req);
            res.render('home', { "quoteDetails": quoteDetails, "branding" : BRANDING, "INSTANA_HEADER": instanaHeader, "pageid": "random", "localSession": localSession });
        })
        .catch( error => {
            quoteDetails.rating = "Rating service currently unavailable.";
            utils.log("Error obtaining rating for quote "+quote_id+" Error: "+error, localSession.token , "WARN");
            var instanaHeader = getInstanaSnippet(req);
            res.render('home', { "quoteDetails": quoteDetails, "branding" : BRANDING, "INSTANA_HEADER": instanaHeader, "pageid": "random", "localSession": localSession });
        })

    })
    .catch( (error) => {
        quoteDetails.quote = "Error obtaining quote.  Please try again.";
        quoteDetails.genre = "";
        quoteDetails.author = "";
        quoteDetails.author_id = "";
        quoteDetails.rating = "";
        utils.log("Error obtaining quote: "+ quote_id + ". " + error, localSession.token , "WARN");
        var instanaHeader = getInstanaSnippet(req);
        res.render('home', { "quoteDetails": quoteDetails, "branding" : BRANDING, "INSTANA_HEADER": instanaHeader, "pageid": "random", "localSession": localSession });
    });

}

serviceManager.endpointGet('/random', "Processing random quote request", handleRandom);

function authorHandler(req,res){
    var ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    var localSession  = newLocalSession();
    utils.log('Starting new request token. Incoming for IP: ' + ip, localSession.token , "INFO");
    var id = req.params.id;
    utils.log('Author bio request: /author/' + id + ' .', localSession.token , "INFO");

    var parsedUrl = parseUrl(process.env.AUTHOR_SVC);
    var hostname = parsedUrl.resource;
    var port = 80;
    if (parsedUrl.port != null) port = parsedUrl.port;

    const options = {
        "headers": { "Accept": "application/json" },
        "method": 'GET',
        "hostname": hostname,
        "port": port,
        "path": '/authors/' + id + '?requestToken=' + localSession.token ,
        "timeout": 5000,
        "requestToken": localSession.token 
    }

    utils.httpRequest(options)
    .then( (bio) => {
        utils.log("Author bio received.  Author id: " + id, localSession.token );
        var instanaHeader = getInstanaSnippet(req);
        res.render('author', { "data" : bio, "hideImage": HIDE_IMAGE, "branding" : BRANDING, "INSTANA_HEADER": instanaHeader, "pageid": "author", "localSession": localSession } );
    })
    .catch( (error) => {
        utils.log("Problem getting author bio.  " + error.message, localSession.token );
        res.status(500).send("Problem getting author bio.");
    });
}

serviceManager.endpointGet('/author/:id', "Processing author bio request", authorHandler);

function imageHandler(req,res){
    var ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    var localSession  = newLocalSession();
    utils.log('Starting new request token. Incoming for IP: ' + ip, localSession.token , "INFO");
    var id = req.params.id;
    utils.log('Author image request: /images/' + id + ' .', localSession.token , "INFO");

    var parsedUrl = parseUrl(process.env.AUTHOR_SVC);
    var hostname = parsedUrl.resource;
    var port = 80;
    if (parsedUrl.port != null) port = parsedUrl.port;

    const options = {
        "headers": { "Accept": "image/jpeg" },
        "method": 'GET',
        "hostname": hostname,
        "port": port,
        "path": '/images/' + id + '?requestToken=' + localSession.token ,
        "timeout": 5000,
        "requestToken": localSession.token 
    }

    utils.httpRequest(options)
    .then( (imageBuf) => {
        utils.log("Author image received.  Author id: " + id, localSession.token , "WARN");
        res.status(200).end(Buffer.from(imageBuf, 'binary'));
    })
    .catch( (error) => {
        utils.log("Problem getting author image.  " + error.message, localSession.token , "WARN");
        res.status(500).send("Problem getting author image.");
    });
}

serviceManager.endpointGet('/images/:id', "Processing author image request", imageHandler);


function pdfHandler(req,res){
    var ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    var localSession  = newLocalSession();
    utils.log('Starting new request token. Incoming for IP: ' + ip, localSession.token , "INFO");
    var id = req.params.id;
    utils.log('PDF request: /pdf/' + id + ' .', localSession.token , "INFO");

    var parsedUrl = parseUrl(process.env.PDF_SVC);
    var hostname = parsedUrl.resource;
    var port = 80;
    if (parsedUrl.port != null) port = parsedUrl.port;

    const options = {
        "headers": { "Accept": "application/pdf" },
        "method": 'GET',
        "hostname": hostname,
        "port": port,
        "path": '/pdf/' + id + '?requestToken=' + localSession.token ,
        "timeout": 5000,
        "requestToken": localSession.token 
    }

    utils.httpRequest(options)
    .then( (pdfBuf) => {
        utils.log("Quote PDF received.  Quote id: " + id, localSession.token , "WARN");
        res.status(200).end(Buffer.from(pdfBuf, 'binary'));
    })
    .catch( (error) => {
        utils.log("Problem building pdf.  " + error.message, localSession.token , "WARN");
        res.status(500).send("Problem building pdf.");
    });
}

serviceManager.endpointGet('/pdf/:id', "Processing PDF request", pdfHandler);


async function qrcodeHandler(req,res){
    var ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    var localSession  = newLocalSession();
    utils.log('Starting new request token. Incoming for IP: ' + ip, localSession.token , "INFO");
    var id = req.params.id;
    utils.log('QR Code request: /qrcode/' + id + ' .', localSession.token , "INFO");

    var parsedUrl = parseUrl(process.env.QRCODE_SVC);
    var hostname = parsedUrl.resource;
    var port = 80;
    if (parsedUrl.port != null) port = parsedUrl.port;

    const options = {
        "headers": { "Accept": "image/png" },
        "method": 'POST',
        "hostname": hostname,
        "port": port,
        "path": '/qotd-qrcode/qr?requestToken=' + localSession.token ,
        "timeout": 5000,
        "requestToken": localSession.token 
    }

    try{
        var payload = await getQuote(id, localSession.token );

        utils.httpRequest(options,payload.quote)
        .then( (buf) => {
            utils.log("QR Code image received.  Quote id: " + id, localSession.token , "WARN");
            res.status(200).end(Buffer.from(buf, 'binary'));
        })
        .catch( (error) => {
            utils.log("Problem building QR code.  " + error.message, localSession.token , "WARN");
            res.status(500).send("Problem building QR code.");
        });
    } catch( error ) {
        utils.log(error,localSession.token);
    }

}

serviceManager.endpointGet('/qrcode/:id', "Processing QR Code request", qrcodeHandler);


function getOrderHandler(req,res){
    var ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    var localSession  = newLocalSession();
    utils.log('Starting new request token. Incoming for IP: ' + ip, localSession.token , "INFO");
    var id = req.params.id;
    utils.log('Order engraving request: /order/' + id + ' .', localSession.token , "INFO");

    var order = {
        "quote_id": id,
        "token": localSession.token ,
        "orderNo": faker.finance.account,
        "dedication": faker.lorem.slug(),
        "street": faker.address.streetAddress(),
        "city": faker.address.cityName(),
        "state": faker.address.stateAbbr()
    }
    order.zip = faker.address.zipCodeByState(order.state);
    var instanaHeader = getInstanaSnippet(req);
    res.render('order', { "order": order, "INSTANA_HEADER": instanaHeader, "pageid": "engraving", "localSession": localSession } );
}

serviceManager.endpointGet('/order/:id', "Getting engraving order details.", getOrderHandler);


async function postOrderHandler(req,res){
    var ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    var localSession  = newLocalSession();
    utils.log('Starting new request token. Incoming for IP: ' + ip, localSession.token , "INFO");
    utils.log('Processing order engraving request: /order.', localSession.token , "INFO");

    var order = req.body;
    order.customer = faker.finance.accountName;

    var quote = await getQuote(order.quote_id, localSession.token );
    order.quote = quote.quote;
    order.author = quote.author;

    var payload = JSON.stringify(order);

    var parsedUrl = parseUrl(ENGRAVING_SVC);
    var hostname = parsedUrl.resource;
    var port = 80;
    if (parsedUrl.port != null) port = parsedUrl.port;
    var path = parsedUrl.pathname + '/order?requestToken=' + localSession.token ;

    const options = {
        "headers": { "Accept": "application/json" },
        "method": 'POST',
        "hostname": hostname,
        "port": port,
        "path": path,
        "timeout": 5000,
        "requestToken": localSession.token 
    }

    utils.httpRequest(options, payload)
    .then( (orderRes) => {
        utils.log("Quote PDF received.  Quote id: " + order.quote_id, localSession.token , "WARN");
        res.status(200).json(orderRes);
    })
    .catch( (error) => {
        utils.log("Problem requesting engraving.  " + error.message, localSession.token , "WARN");
        res.status(500).send("Problem requesting engraving. "+error.message);
    });
}
serviceManager.endpointPost('/order', "Submitting engraving request to manufacturing.", postOrderHandler);



//================================================================================================
// Common app endpoints

app.get('/',
    function (req, res) {
        serviceManager.log('/',null,"DEBUG");
        res.redirect('/version');
    }
);

app.get('/version',
    function (req, res) {
        serviceManager.log('/version',null,"DEBUG");
        var ip = req.clientIp;
        res.send(`${appName} v${appVersion}, build: ${buildInfo}.  Your IP: ${ip}`);
    }
);

//================================================================================================
// Main app

const package = require('./package.json');
const { randomInt } = require('crypto');
const appName = package.name;
const appVersion = package.version;
const buildInfo = fs.readFileSync('build.txt', 'utf8').trim();

appService = app.listen(app.get('port'), '0.0.0.0', function () {
    console.log(`Starting ${appName} v${appVersion}, ${buildInfo} on port ${app.get('port')}`);
});

