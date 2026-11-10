# Sharing a review

## A file now

Use Save > HTML with comments and send that one file through a channel you already use.
The recipient downloads it and opens it in a browser.
No installation or server is needed.
Zip the HTML if the channel blocks HTML attachments.
The editable review and feedback are embedded in the file and can be exported from its Save menu.
Do not rely on an attachment preview to run the viewer.

For several reviewers, send the same review snapshot and ask each person to return Export feedback.
Import those files to gather the requests and copy a selected agent prompt.
Everyone's browser copy is independent.
This is useful for a small design review without an account system or shared service.

## A link next

My recommendation is a small private review hub.
Give each reviewed revision a stable URL and serve the same self-contained HTML.
Protect it with sign-in when the review or source is private.
Cloudflare Access can put authentication in front of a web hostname, with policies defining who may open it.
See the official [web application setup](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/).

A static link makes the document easy to open, but comments are still local until a shared service stores them.
The next shared feature should store feedback by review ID and source revision, retaining comment IDs, authors and edit history.
That would let reviewers read the same discussion and let an agent consume a feedback snapshot.
The current feedback file format supplies that boundary.

Keep revision snapshots stable so a reviewer can see which source a comment referred to.
An updated review may keep its stable node IDs, but it should retain the older snapshot and flag comments that need new context.
Live graph editing and new agent APIs can wait until that workflow needs them.

Hosting privacy needs its own check even if the source repository is private.
For example, Cloudflare Pages preview URLs are public by default, and its preview-only Access setting does not protect the production domain.
The deployment would need access control on every reachable hostname.
See the official [preview access rules](https://developers.cloudflare.com/pages/configuration/preview-deployments/#customize-preview-deployments-access).

No hosting, account service or shared comment store is included in this local version.
