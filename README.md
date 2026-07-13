# EDS Contacts Integration

Thunderbird extension for synchronizing contacts with Evolution Data Server (EDS) on Linux.

## Features

* EDS → Thunderbird contact creation and updates
* Optional propagation of EDS deletions to Thunderbird
* Optional creation in EDS of new contacts added to the Thunderbird `Evolution` address book
* Event-driven change detection through a local Native Messaging helper
* Explicit consent and synchronization disabled by default
* Thunderbird 140 ESR compatibility

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
* Thunderbird 140 ESR or newer
* Evolution Data Server
* [`eds-contacts-helper`](https://github.com/ThierryHFR/eds-contacts-helper)

## Installation

1. Install the native helper from its [release page](https://github.com/ThierryHFR/eds-contacts-helper/releases).
2. Install the Thunderbird extension.
3. Open the extension settings, review the local data exchange disclosure and grant consent if you agree.
4. Explicitly enable synchronization and save the settings.

The extension can be installed without the helper, but synchronization and diagnostics will not work until the helper is installed.

## Data and privacy

Contact vCards are exchanged only between Thunderbird and the locally installed helper. Neither component sends contacts, telemetry or analytics over the network. See [PRIVACY.md](PRIVACY.md).

## Current status

Version 2.0.1 is experimental. Back up important address books before enabling deletion propagation.

## License

GPL-3.0-only
