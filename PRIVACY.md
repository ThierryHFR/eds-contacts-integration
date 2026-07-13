# Privacy policy

Last updated: 2026-07-13

EDS Contacts Integration synchronizes contact information between Thunderbird and Evolution Data Server on the same Linux computer.

## Data processed

When the user explicitly grants consent and enables synchronization, the extension and the separately installed EDS Contacts Helper process contact cards in vCard format. These cards can contain names, email addresses, telephone numbers, postal addresses, notes and any other fields stored in the contact.

The extension also stores local synchronization metadata in Thunderbird, including mappings between EDS and Thunderbird contact identifiers, hashes used to detect changes, and pending locally created contacts.

## Data transmission

Contact data is exchanged locally between Thunderbird and EDS Contacts Helper through Mozilla Native Messaging. The extension and helper do not send contact data, telemetry or analytics to the developer or to any remote service.

The options page contains a normal link to the helper release page on GitHub. Opening that link is an explicit user action and is not part of synchronization.

## Local logs

EDS Contacts Helper writes technical diagnostic information to `~/.cache/eds-contacts-helper.log`. Logs can include EDS address-book names, technical errors and contact counts, but the helper does not intentionally log complete vCards, contact names, email addresses or contact identifiers.

## User control

Synchronization is disabled by default. The user must grant consent and enable it in the extension settings. Consent can be withdrawn at any time by clearing the consent option and saving. Propagation of deletions from EDS to Thunderbird is a separate option and is disabled by default.

Uninstalling the extension removes its access to Thunderbird. The native helper can be removed separately by deleting `~/.local/bin/eds-contacts-helper.py` and `~/.mozilla/native-messaging-hosts/eds_contacts_helper.json`.

## Contact

Questions and issue reports can be submitted through the project repository:

<https://github.com/ThierryHFR/eds-contacts-integration/issues>
