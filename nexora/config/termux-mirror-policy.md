# Termux → NEXORA Debian mirror policy

This directory records the exact Termux inventory supplied for the NEXORA build preparation.

The inventory is evidence, not a literal Debian apt list. Android/Termux-only packages (termux-*, libandroid-*, ndk-sysroot, Android Rust stdlib, etc.) are recorded for traceability but are not installed in Debian. Debian equivalents are selected by command/function and verified during the RootFS build.

Python packages are recorded at the observed versions. Native/ABI-sensitive packages must be resolved for the Debian/Python ABI rather than blindly forcing Android wheels.

Global npm packages are recorded for traceability. OmniRoute is built from the repository source; it is not required to be installed globally in the NEXORA image.

Ruby's standard/default gems are provided by the Debian Ruby runtime; they are not copied byte-for-byte from Termux.

No GitHub Actions Run is started by this inventory commit.
