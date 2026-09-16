# EDS Contacts Integration

Thunderbird extension for synchronizing contacts with Evolution Data Server (EDS) on Linux.

## Features

* EDS → Thunderbird contact creation and updates
* Optional propagation of EDS deletions to Thunderbird
* Optional creation in EDS of new contacts added to the Thunderbird `Evolution` address book
* Event-driven change detection through a local Native Messaging helper
* Explicit consent and synchronization disabled by default
* Thunderbird 153+ compatibility

Changes and deletions made in Thunderbird are not currently propagated to EDS.

## Architecture

```text
Thunderbird Extension
        ⇅ Native Messaging (local JSON messages)
eds-contacts-helper
        ⇅ EDS / libebook / D-Bus
Evolution Data Server
```

The helper runs outside Thunderbird so that GNOME and Evolution libraries are not loaded into Thunderbird.

## Requirements

* Linux
* Thunderbird 153 or newer
* Evolution Data Server
* [`eds-contacts-helper`](https://github.com/ThierryHFR/eds-contacts-helper)

## Installation

1. Install the native helper from its [release page](https://github.com/ThierryHFR/eds-contacts-helper/releases).
2. Install the Thunderbird extension.
3. Open the extension settings, review the local data exchange disclosure and grant consent if you agree.
4. Explicitly enable synchronization and save the settings.

The extension can be installed without the helper, but synchronization and diagnostics will not work until the helper is installed.

## Data and privacy

When the user explicitly grants consent and enables synchronization, the extension and the separately installed EDS Contacts Helper process contact cards in vCard format. These cards may contain names, email addresses, telephone numbers, postal addresses, notes, and any other fields stored in the contact.

Contact data is exchanged only between Thunderbird and the locally installed helper through Mozilla Native Messaging. Neither the extension nor the helper sends contacts, telemetry, or analytics to the developer or to any remote service. The options page contains a normal link to the helper release page on GitHub; opening that link is an explicit user action and is not part of synchronization.

The extension stores local synchronization metadata in Thunderbird, including mappings between EDS and Thunderbird contact identifiers, hashes used to detect changes, and pending locally created contacts. The helper writes technical diagnostic information to `~/.cache/eds-contacts-helper.log`; logs can include EDS address-book names, technical errors, and contact counts, but the helper does not intentionally log complete vCards, contact names, email addresses, or contact identifiers.

Synchronization is disabled by default. The user must grant consent and enable it in the extension settings. Consent can be withdrawn at any time by clearing the consent option and saving. Propagation of deletions from EDS to Thunderbird is a separate option and is disabled by default.

## Native Messaging disclosure

The extension uses Native Messaging to communicate with the separately installed `eds_contacts_helper` application. The helper runs locally on the same Linux computer and connects to Evolution Data Server (EDS) through the system's Evolution/libebook and D-Bus services.

Native Messaging is not used during installation or normal browsing. The extension connects to the helper only after the user has granted consent and enabled synchronization. The diagnostic **Test helper** action also requires consent, but does not require automatic synchronization to be enabled. The connection is closed when synchronization is disabled.

Each request contains a numeric `requestId`, an `action`, and, where applicable, the following payload. Responses include the same `requestId`, an `ok` status, and the result or an error message:

| Action | Data sent by the extension | Data returned by the helper |
| --- | --- | --- |
| `ping` | No contact data | Helper availability and version information |
| `diagnostics` | No contact data | Technical diagnostic information about the helper and EDS |
| `watch` | The configured watch interval in seconds | Confirmation that watching started, or an error |
| `listContacts` | No contact data | EDS contacts, including their vCards and identifiers needed for synchronization |
| `addContact` | One Thunderbird contact vCard | The identifier assigned to the new EDS contact |

The helper can also send local events: `edsChanged` triggers a synchronization when authorized, while `watchStarted` and `watchError` report the status of change monitoring. These events do not contain contact data.

The extension can be installed without the helper, but synchronization and diagnostics will not work until the helper is installed. Uninstalling the extension removes its access to Thunderbird. The native helper can be removed separately by deleting `~/.local/bin/eds-contacts-helper.py` and `~/.mozilla/native-messaging-hosts/eds_contacts_helper.json`.

Questions and issue reports can be submitted through the [project repository](https://github.com/ThierryHFR/eds-contacts-integration/issues).

## Current status

Version 2.0.5 is experimental. Back up important address books before enabling deletion propagation.

## License

GPL-3.0-only
