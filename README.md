# eds-contacts-integration

Thunderbird extension for bidirectional contact synchronization with Evolution Data Server (EDS).

## Features

* Synchronize contacts between Thunderbird and Evolution Data Server
* Event-driven EDS → Thunderbird updates
* Thunderbird → EDS contact synchronization
* Native Messaging integration
* Automatic Evolution address book creation/restoration
* Linux desktop integration
* Thunderbird 140 ESR compatible

## Architecture

`eds-contacts-integration` works together with the external project:

```text
eds-contacts-helper
```

The extension communicates with the helper using Mozilla Native Messaging.

```text
Thunderbird Extension
        ⇅ Native Messaging
eds-contacts-helper
        ⇅ EDS / libebook / DBus
Evolution Data Server
```

This architecture avoids loading GNOME / Evolution libraries directly inside Thunderbird, improving stability and preventing crashes.

## Requirements

* Thunderbird 140 ESR or newer
* Linux
* Evolution Data Server
* `eds-contacts-helper`

## Installation

1. Install the Thunderbird extension
2. Install the native helper:
   [https://github.com/ThierryHFR/eds-contacts-helper/releases](https://github.com/ThierryHFR/eds-contacts-helper/releases)
3. Restart Thunderbird

## Current Status

Experimental but functional.

Implemented:

* EDS → Thunderbird synchronization
* Thunderbird → EDS synchronization
* Event-driven updates
* Native Messaging integration
* Helper diagnostics
* Manual synchronization support

## License

GPL-3.0-only
