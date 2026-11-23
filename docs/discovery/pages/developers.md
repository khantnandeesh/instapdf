# developers

URL: https://www.sejda.com/developers

Title: Developers - API Docs

Meta description: Developer documentation for our HTML to PDF API, web integrations such as 'Save as PDF' links and deep links to open your files with SEJDA.COM tools.

## Headings
- h3: Contact SEJDA.COM support
- h4: Scanned documents are not supported
- h1: Developer Docs
- h3: For your website
- h3: HTML to PDF – API Docs
- h2: Web Integrations
- h3: Edit PDFs from your website
- h4: Link Generator
- h4: Link Setup
- h3: 'Save as PDF' link for your website
- h4: How it works
- h4: Copy & paste snippet
- h4: Customize
- h2: HTML to PDF – API Docs
- h4: Authentication
- h4: Get started
- h4: Endpoint URL
- h4: Request
- h4: HTML to PDF Options
- h4: HTTP Response Codes
- h4: CSS Tricks
- h4: Code Samples
- h3: API access to other PDF tools?

## Form field names
allowAccessLastTask, consoleLogs, dontShowAnymore, email, events, fileLocation, lastFile, lastTask, message, moveNewPageNumber, os, returnEmail, screenshot, selectedTool, source, source2, suflet, supportMessageKind

## Page-specific visible text (shared nav/footer/limits removed)

Developers - API Docs
For your website
Edit PDF link
Save as PDF link
HTML to PDF – API Docs
Get started
Options
Response codes
CSS tricks
Code samples
Web Integrations
Edit PDFs from your website
Create a special link that anyone can use to fill out your document and send it back to you.
Share the link on your website or in your emails.
Link Generator
1. Where is the file located?
On my website
My computer
The publicly accessible URL where the file is available on your website:
Right click the file in Google Drive and choose "Share". Under "General access" choose "Anyone with the link". Click on "Copy link" and paste it below:
Right click the file in Dropbox and choose "Share" > "Share with Dropbox". Then click on "Create and copy link" and paste it below:
We don't offer document storage. Please upload the file to Google Drive or Dropbox, then select the respective option above for detailed instructions.
The publicly accessible URL for the file is:
2. Which features?
Only Fill & Sign
Full editing
3. Receive results by email?
We'll ask the user if they want to send the edited document to this email address.
The generated link
Copy code
Click to try
Link Setup
Pass input files as
GET
parameters, in
JSON
format:
https://www.sejda.com/pdf-editor?
files=[{"downloadUrl":"https://www.example.com/download/sample.pdf"}]
Don't forget to
URL encode
the
JSON
value:
?files=
%5B%7B%22downloadUrl%22%3A%22https%3A%2F%2Fwww.example.com%2Fdownload%2Fsample.pdf%22%7D%5D
Add a
returnEmail
parameter to the URL if you would like the user to be asked if they want to send the edited document by email back to you.
https://www.sejda.com/pdf-editor?files=[{"downloadUrl":"https://www.example.com/download/sample.pdf"}]&
returnEmail=name@example.com
Remember to URL encode the email address value passed in:
&returnEmail=name%40example.com
'Save as PDF' link for your website
Let your visitors save pages from your website to PDF.
Using the 'Save as PDF' link is free and does not require a paid plan.
Each of your website visitors will be able to use the link and 'Save as PDF' up to 10 times per hour.
How it works
Your web page
Save as PDF link
<a href="https://www.sejda.com/html-to-pdf?
save-link=https://www.example.com/page
">Save as PDF</a>
Copy & paste snippet
Always save the current page as PDF:
<a id="saveAsPdfBtn" href="https://www.sejda.com/html-to-pdf">Save as PDF</a>
<script>
document.getElementById('saveAsPdfBtn').addEventListener('click', function(e){
var pageUrl = encodeURIComponent(window.location.href);
var opts = ['save-link=' + pageUrl, 'pageOrientation=auto'];
window.open('https://www.sejda.com/html-to-pdf?' + opts.join('&'));
e.preventDefault();
});
</script>
Customize
More options can be specified:
https://www.sejda.com/html-to-pdf?save-link=https://example.com&
viewportWidth=1440
&
pageSize=A3
Name
Description
save-link
Web page URL to convert to PDF. Eg:
https://example.com/my-page
. Mandatory. Don't forget to URL encode.
pageSize
One of the standard page sizes:
a0
,
a1
,
a2
,
a3
,
a4
,
a5
,
letter
,
legal
. Defaults to one long page.
viewportWidth
The width, in pixels, for the rendered HTML page. Eg:
1440
. Defaults to browser's
window.innerWidth
pageOrientation
One of
portrait
,
landscape
or
auto
(default). Eg:
auto
pageMargin
Size of page margin, including units (
px
,
in
,
cm
or
mm
). Eg:
100px
. Defaults to no margin.
usePrintMedia
Use the print stylesheet. Eg:
true
. Defaults to
false
delay
Seconds (0 to 5) to wait before starting to convert. Eg:
. Defaults to
0
HTML to PDF – API Docs
Authentication
Sign up for an account
to get started and get your API key.
Provide your API key in the
Authorization
header of each request:
Authorization: Token: api_Y0URAP1K3YH3R3
Want to use in the browser/client side javascript? Use the publishable key instead:
see CORS sample code
Get started
Run this CURL command in your console:
$> curl -i https://api.sejda.com/v2/html-pdf\
--fail --silent --show-error \
--header "Content-Type: application/json" \
--header "Authorization: Token: api_Y0URAP1K3YH3R3" \
--data '{"url": "https://www.example.com", "viewportWidth":1200 }' > example_com.pdf
Endpoint URL
The API is organized around REST.
https://api.sejda.com/v2/html-pdf
Request
Make a
POST
request with
JSON
body:
Content-Type: application/json
Examples:
{"url":"example.com"}
Converting HTML code (instead of an URL) to PDF:
{"htmlCode":"<strong>HTML<\/strong>"}
HTML to PDF Options
Name
Type
Default
Description
url
string
optional
Web page URL to convert to PDF.
Eg:
https://example.com
htmlCode
string
optional
HTML source code to convert to PDF.
Eg:
<strong>HTML</strong>
pageSize
string
one_long_page
one_long_page
, a standard page size:
a0
,
a1
,
a2
,
a3
,
a4
,
a5
,
a6
letter
,
legal
,
tabloid
,
ledger
or a custom page size:
30x40mm
Possible units are:
px
,
cm
,
mm
or
in
pageOrientation
string
auto
landscape
,
portrait
or
auto
viewportWidth
integer
optional
The width in pixels for the rendered web page.
Eg:
1600
pageMargin
double
optional
Specifies the size of the margin around the PDF page. To be used together with
pageMarginUnits
Eg:
2.2
pageMarginUnits
string
optional
Specifies the units to be used for the margin size. One of
px
,
in
,
cm
or
mm
. To be used together with
pageMargin
Eg:
px
for a margin size specified in pixels.
hideNotices
boolean
false
Attempt to automatically hide cookie notices and similar overlays.
Eg:
true
usePrintMedia
boolean
false
Use the print stylesheet.
Eg:
true
delay
int
0
Seconds (0 to 5) to wait before starting to convert. Useful if your website has an intro animation, etc.
scrollPage
boolean
false
Lazy loading of resources. Scroll page all the way down before converting.
Eg:
true
authUsername
string
optional
Username for HTTP authentication.
Eg:
Admin
authPassword
string
optional
Password for HTTP authentication.
Eg:
!S3cr3t
waitForSelector
string
pro-only
Wait for the selector to appear in page, then begin the PDF conversion.
Eg:
#pageFullyLoaded
timezone
string
optional
A
timezone id
Eg:
America/New_York
shims
string
optional
Hints to attempt workarounds for rendering issues.
Eg:
css-viewport-percent-units
lang
string
optional
Browser language/locale.
Eg:
ar
,
am
,
bg
,
bn
,
ca
,
cs
,
da
,
de
,
el
,
en
,
en_AU
,
en_GB
,
en_US
,
es
,
es_419
,
et
,
fa
,
fi
,
fil
,
fr
,
gu
,
he
,
hi
,
hr
,
hu
,
id
,
it
,
ja
,
kn
,
ko
,
lt
,
lv
,
ml
,
mr
,
ms
,
nl
,
no
,
pl
,
pt_BR
,
pt_PT
,
ro
,
ru
,
sk
,
sl
,
sr
,
sv
,
sw
,
ta
,
te
,
th
,
tr
,
uk
,
vi
,
zh_CN
,
zh_TW
HTTP Response Codes
200
All OK. Response contents will be the PDF document stream.
400
Invalid request.
403
Account unconfirmed, no api key provided, CORS origin not allowed etc. Details provided in the response body.
413
Request size too large. Current limit is 50MB. Try converting by URL instead of providing the HTML body.
429
Rate limit reached (per hour or concurrency limit). You should retry the request. Details provided in the response body.
450
Pro-only parameter used with free account. Parameters marked with pro-only are available on paid plans only.
500
An error on our side. You should retry the request.
550
Failed to convert (Eg: Web page was not reachable, could not be loaded). Details provided in the response body.
CSS Tricks
Hide elements in PDF
Add the CSS class
--hide-from-pdf
to remove that element from the PDF.
<div class="--hide-from-pdf">Hide me</div>
Show elements only in PDF
Use the CSS class
--show-in-pdf
and the inline CSS
style="display: none"
to show in PDF an element that is hidden in HTML. When rendering the PDF the inline style will be changed to
display: block
<div class="--show-in-pdf" style="display:none">Show me</div>
Page breaks & footer
Try this CSS style to force page breaks:
<style>
.with-page-break {
page-break-before: always;
page-break-after: always;
}
</style>
Example: Same footer on each page:
<style>
.with-page-break {
page-break-before: always;
page-break-after: always;
}
.footer {
position: fixed;
bottom: 0;
}
</style>
<div class="with-page-break">Page 1</div>
<div class="with-page-break">Page 2</div>
<div class="with-page-break">Page 3</div>
<div class="footer">This is a footer</div>
Example: Different footer each page, at the bottom:
<style>
html,body { height: 100%; margin: 0; }
.page {
page-break-before: always;
page-break-after: always;
height: 100%;
overflow: hidden;
margin: 0;
position: relative;
}
.page-footer {
position: absolute;
bottom: 5px;
}
</style>
<div class="page">
<div class="page-contents">Page 1</div>
<div class="page-footer">Page 1 footer</div>
</div>
<div class="page">
<div class="page-contents">Page 2</div>
<div class="page-footer">Page 2 footer</div>
</div>
Make sure you specify a
pageSize
(eg:
a4
) and the
hideNotices
parameter is not set (or is set to
false
)
Page numbers
To add current page numbers and total pages count to a page footer (eg: "Page 1 of 5") you can use Javascript. Here's an example:
<style>
html,body { height: 100%; margin: 0; }
.page {
page-break-before: always;
page-break-after: always;
height: 100%;
overflow: hidden;
margin: 0;
position: relative;
}
.page-footer {
position: absolute;
bottom: 5px;
}
</style>
<div class="page">
<div class="page-contents">Page 1</div>
<div class="page-footer">
<span class="js-page-number"></span> / <span class="js-pages-total"></span>
</div>
</div>
<div class="page">
<div class="page-contents">Page 2</div>
<div class="page-footer">
<span class="js-page-number"></span> / <span class="js-pages-total"></span>
</div>
</div>
<div class="page">
<div class="page-contents">Page 3</div>
<div class="page-footer">
<span class="js-page-number"></span> / <span class="js-pages-total"></span>
</div>
</div>
<script>
(function() {
let pageCounter = 1;
const pageNumElems = document.getElementsByClassName('js-page-number');
Array.from(pageNumElems).forEach((elem) => {
elem.innerHTML = pageCounter;
pageCounter++;
});
const totalPagesCount = document.querySelectorAll('.page').length;
const pageTotals = document.getElementsByClassName('js-pages-total');
Array.from(pageTotals).forEach((elem) => {
elem.innerHTML = totalPagesCount;
});
})()
</script>
Using Google web fonts in your PDF documents
Here's an example on how to use Google web fonts.
<html>
<head>
<link href="https://fonts.googleapis.com/css2?family=Merriweather&display=swap" rel="stylesheet">
<style>
body {
font-family: 'Merriweather', serif;
font-size: 30px;
}
</style>
</head>
<body>Almost before we knew it, we had left the ground.</body>
</html>
Specific page size (A4, Letter)
Ensure your HTML will render well in a specific page size (A4, Letter, etc.) when converted to PDF.
<style>
@page {
size: A4;
margin: 0;
}
.page {
width: 210mm;
height: 297mm;
margin: 0;
}
</style>
<div class="page">Page 1</div>
<div class="page">Page 2</div>
Stronger guarantee that page is fully loaded
On complex pages, ensure all content is fully loaded before converting to PDF. Avoids potential partial content issues.
When you decide the page finished loading (eg: your last ajax section was rendered), inject a special dom element on page.
var el = document.createElement('div');
el.style.display = 'none';
el.id = 'pageFullyLoaded';
document.body.appendChild(el);
Then make your API requests include
"waitForSelector":"#pageFullyLoaded"
We'll wait for the selector to appear in page, then begin the PDF conversion.
Using the "waitForSelector" will not extend the timeout for the API request, the maximum time we wait for the page to load and convert it to PDF stays the same.
Code Samples
HTML to PDF in Bash Curl
$> curl -i https://api.sejda.com/v2/html-pdf\
--fail --silent --show-error \
--header "Content-Type: application/json" \
--header "Authorization: Token: api_Y0URAP1K3YH3R3" \
--data '{"url": "https://example.com", "viewportWidth":1200 }' > out.pdf
HTML to PDF in Node.js Javascript
// npm install request
const request = require('request');
const fs = require('fs');
var opts = {
uri: 'https://api.sejda.com/v2/html-pdf',
headers: {
'Authorization' : 'Token: ' + apiKey,
},
json: {
'url': 'https://example.com',
'viewportWidth': 1200
}
};
request.post(opts)
.on('error', function(err){
return console.error(err);
})
.on('response', function(response) {
if (response.statusCode === 200) {
response.pipe(fs.createWriteStream('/tmp/out.pdf'))
.on('finish', function () {
console.log('PDF saved to disk');
});
} else {
return console.error('Got code: ' + response.statusCode);
}
});
HTML to PDF in Python
import requests
url = 'https://api.sejda.com/v2/html-pdf'
r = requests.post(url, json = {
'url': 'https://example.com',
'viewportWidth': 1200
}, headers = {
'Authorization': 'Token: {}'.format(apiKey)
})
open('/tmp/out.pdf', 'wb').write(r.content)
HTML to PDF in Javascript with CORS
<script src="//www.sejda.com/js/sejda-js-api.min.js"></script>
<script>
document.getElementById('downloadPdfBtn')
.addEventListener('click', function(e){
SejdaJsApi.htmlToPdf({
filename: 'out.pdf',
/* leave blank for one long page */
pageSize: 'a4',
publishableKey: 'api_public_y0urap1k3yh3r3',
htmlCode: document.querySelector('html').innerHTML,
/* url: window.location.href */
always: function() {
// PDF download should have started
},
error: function(err) {
console.error(err);
alert('An error occurred');
}
});
})
</script>
/* Don't forget to configure your API Allowed domains, on your account page. */
HTML to PDF in Java
<!-- Maven dependency -->
<dependency>
<groupId>org.apache.httpcomponents</groupId>
<artifactId>httpclient</artifactId>
<version>4.5.8</version>
</dependency>
import org.apache.http.HttpResponse;
import org.apache.http.client.methods.HttpPost;
import org.apache.http.entity.ContentType;
import org.apache.http.entity.StringEntity;
import org.apache.http.impl.client.CloseableHttpClient;
import org.apache.http.impl.client.HttpClientBuilder;
CloseableHttpClient httpClient = HttpClientBuilder.create().build();
HttpPost request = new HttpPost("https://api.sejda.com/v2/html-pdf");
request.setHeader(HttpHeaders.AUTHORIZATION, "Token: " + apiKey);
request.setEntity(new StringEntity(
"{\"url\": \"https://example.com\", \"viewportWidth\":1200 }",
ContentType.APPLICATION_JSON));
HttpResponse response = httpClient.execute(request);
if (response.getStatusLine().getStatusCode() == 200) {
try (InputStream in = response.getEntity().getContent();
OutputStream out = new FileOutputStream(new File("/tmp/out.pdf"))) {
byte[] buffer = new byte[8 * 1024];
int bytesRead;
while ((bytesRead = in.read(buffer)) != -1) {
out.write(buffer, 0, bytesRead);
}
}
}
HTML to PDF in PHP
$url = "https://api.sejda.com/v2/html-pdf";
$content = json_encode(array('url' => 'https://example.com'));
$curl = curl_init($url);
curl_setopt($curl, CURLOPT_HEADER, false);
curl_setopt($curl, CURLOPT_RETURNTRANSFER, true);
curl_setopt($curl, CURLOPT_HTTPHEADER, array(
"Content-type: application/json",
"Authorization: Token: " . $apiKey));
curl_setopt($curl, CURLOPT_POST, true);
curl_setopt($curl, CURLOPT_POSTFIELDS, $content);
$response = curl_exec($curl);
$status = curl_getinfo($curl, CURLINFO_HTTP_CODE);
if ($status == 200) {
$fp = fopen("out.pdf", "w");
fwrite($fp, $response);
fclose($fp);
print("PDF saved to disk");
} else {
print("Error: failed with status $status, response $response, curl_error " . curl_error($curl) . ", curl_errno " . curl_errno($curl));
}
HTML to PDF in C# .NET
using System.Net.Http;
using Newtonsoft.Json.Linq;
var baseUrl = "https://api.sejda.com/v2/html-pdf";
using (var client = new HttpClient())
{
client.DefaultRequestHeaders.TryAddWithoutValidation(
"Authorization", "Token: " + apiKey
);
var json = new JObject();
json.Add("url", "https://example.com");
json.Add("viewportWidth", 1200);
//json.Add("htmlCode", File.ReadAllText(@"c:\doc.html", Encoding.UTF8));
var content = new StringContent(json.ToString(), Encoding.UTF8, "application/json");
using (var res = await client.PostAsync(baseUrl, content))
{
var statusCode = (int)res.StatusCode;
if (statusCode == 200)
{
var httpStream = await res.Content.ReadAsStreamAsync();
var outputFilePath = Path.GetTempFileName();
using (var fileStream = File.Create(outputFilePath))
using (var reader = new StreamReader(httpStream))
{
httpStream.CopyTo(fileStream);
fileStream.Flush();
}
// outputFilePath contains the PDF output
}
else
{
// retry, then handle error
throw new Exception("Unexpected response code: " + statusCode);
}
}
}
API access to other PDF tools?
We do not offer API access to other PDF tools at the moment (Eg: merge, compress, etc).
