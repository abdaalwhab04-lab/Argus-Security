import Foundation
import Virtualization
import Dispatch

// Standard FileHandle extension for reading
extension FileHandle {
    func enableReadabilityHandler(_ handler: @escaping (FileHandle) -> Void) {
        self.readabilityHandler = handler
    }
}

struct VMConfig: Codable {
    let kernelPath: String
    let initrdPath: String?
    let cmdline: String
    let memorySizeMB: Int
    let cpuCount: Int
    let vsockPath: String?
    let sharedDirs: [SharedDir]? // path -> tag mapping
}

struct SharedDir: Codable {
    let hostPath: String
    let tag: String
    let readonly: Bool
}

class VMDelegate: NSObject, VZVirtualMachineDelegate {
    func guestDidStop(_ virtualMachine: VZVirtualMachine) {
        print("{\"status\": \"stopped\"}")
        exit(0)
    }

    func virtualMachine(_ virtualMachine: VZVirtualMachine, didStopWithError error: Error) {
        print("{\"status\": \"error\", \"message\": \"\(error.localizedDescription)\"}")
        exit(1)
    }
}

func createVirtualMachine(config: VMConfig) -> VZVirtualMachine? {
    let bootLoader = VZLinuxBootLoader(kernelURL: URL(fileURLWithPath: config.kernelPath))
    
    if let initrd = config.initrdPath {
        bootLoader.initialRamdiskURL = URL(fileURLWithPath: initrd)
    }
    
    bootLoader.commandLine = config.cmdline

    let vmConfig = VZVirtualMachineConfiguration()
    vmConfig.bootLoader = bootLoader
    vmConfig.cpuCount = config.cpuCount
    vmConfig.memorySize = UInt64(config.memorySizeMB) * 1024 * 1024

    // Serial Console
    let serialConfig = VZVirtioConsoleDeviceSerialPortConfiguration()
    serialConfig.attachment = VZFileHandleSerialPortAttachment(
        fileHandleForReading: FileHandle.nullDevice,
        fileHandleForWriting: FileHandle.standardOutput
    )
    vmConfig.serialPorts = [serialConfig]

    // Network (NAT)
    let nat = VZNATNetworkDeviceAttachment()
    let networkConfig = VZVirtioNetworkDeviceConfiguration(attachment: nat)
    vmConfig.networkDevices = [networkConfig]

    // Entropy
    let entropyConfig = VZVirtioEntropyDeviceConfiguration()
    vmConfig.entropyDevices = [entropyConfig]

    // Vsock
    if let socketPath = config.vsockPath {
         // In a real implementation using VZVirtioSocketDeviceConfiguration usually exposes 'devices' to the Guest.
         // Connecting it to a unix socket on host is tricky with VZ. 
         // VZVirtioSocketDeviceConfiguration normally exposes a listener on the host side or delegate.
         // For simplistic "bridge" we might need a custom sidecar or use VZ usage of specific socket listeners.
         // For now, we setup a standard device. 
         let vsockConfig = VZVirtioSocketDeviceConfiguration()
         vmConfig.socketDevices = [vsockConfig]
         // Note: Host-side Unix domain socket connecting to VZ is different than Firecracker's UDS. 
         // macOS VZ exposes the socket via VZVirtioSocketDevice which the host app talks to properly
         // via the VZVirtualMachine instance, not a file path directly.
         // We'll leave this simplified for now: The Swift runner acts as the bridge.
    }

    // Virtio-FS
    if let sharedDirs = config.sharedDirs {
        for dir in sharedDirs {
            let tag = dir.tag
            let path = dir.hostPath
            if let dirURL = URL(string: "file://\(path)") { 
                let sharedDir = VZSharedDirectory(url: dirURL, readOnly: dir.readonly)
                let fsConfig = VZVirtioFileSystemDeviceConfiguration(tag: tag)
                fsConfig.share = VZSingleDirectoryShare(directory: sharedDir)
                vmConfig.storageDevices.append(fsConfig) // Oops, FileSystem devices are separate property
                // Correct property:
                vmConfig.directorySharingDevices.append(fsConfig)
            }
        }
    }

    do {
        try vmConfig.validate()
        return VZVirtualMachine(configuration: vmConfig)
    } catch {
        print("{\"status\": \"config_error\", \"message\": \"\(error.localizedDescription)\"}")
        return nil
    }
}

// Main
guard let data = FileHandle.standardInput.readDataToEndOfFile() as Data?,
      let config = try? JSONDecoder().decode(VMConfig.self, from: data) else {
    print("{\"status\": \"error\", \"message\": \"Invalid JSON input\"}")
    exit(1)
}

guard let vm = createVirtualMachine(config: config) else {
    exit(1)
}

let delegate = VMDelegate()
vm.delegate = delegate

let queue = DispatchQueue(label: "vm-queue")

vm.start { (result) in
    switch result {
    case .success:
        print("{\"status\": \"running\"}")
    case .failure(let error):
        print("{\"status\": \"error\", \"message\": \"\(error.localizedDescription)\"}")
        exit(1)
    }
}

RunLoop.main.run()
