# Native Messaging disclosure

EDS Contacts Integration uses Mozilla Native Messaging to communicate with the separately installed `eds_contacts_helper` application. The helper runs locally on the same Linux computer and connects to Evolution Data Server (EDS) through the system's Evolution/libebook and D-Bus services.

## When communication occurs

Native Messaging is not used during installation or normal browsing. The extension connects to the helper only after the user has granted consent and enabled synchronization in the extension settings. The diagnostic **Test helper** action also requires consent, but does not require automatic synchronization to be enabled.

The connection is closed when synchronization is disabled. If the helper is not installed or cannot be started, synchronization remains unavailable and no contact data is sent to a remote service.

## Messages exchanged

Each request contains a numeric `requestId`, an `action`, and, where applicable, the payload shown below. Responses include the same `requestId`, an `ok` status, and the result or an error message.

| Action | Data sent by the extension | Data returned by the helper |
| --- | --- | --- |
| `ping` | No contact data | Helper availability and version information |
| `diagnostics` | No contact data | Technical diagnostic information about the helper and EDS |
| `watch` | The configured watch interval in seconds | Confirmation that watching started, or an error |
| `listContacts` | No contact data | EDS contacts, including their vCards and identifiers needed for synchronization |
| `addContact` | One Thunderbird contact vCard | The identifier assigned to the new EDS contact |

The helper can also send local events: `edsChanged` triggers a synchronization when authorized, while `watchStarted` and `watchError` report the status of change monitoring. These events do not contain contact data.

## Data handling

Contact vCards may contain names, email addresses, telephone numbers, postal addresses, notes, and any other fields stored in the contact. They are exchanged only between Thunderbird and the locally installed helper. The extension does not send contact data, telemetry, or analytics to the developer or to a remote service.

The extension stores synchronization mappings, change-detection hashes, and pending locally created vCards in Thunderbird local storage. See [PRIVACY.md](PRIVACY.md) for the complete privacy policy.
