import { dlopen, FFIType } from "bun:ffi";

export type Pointer = number | bigint | ArrayBuffer | ArrayBufferView;
export const structs = {
  "MIB_IF_ROW2": {
    "size": 312,
    "fields": [
      {
        "name": "InterfaceLuid",
        "offset": 0,
        "type": "Windows.Win32.NetworkManagement.Ndis.NET_LUID_LH"
      },
      {
        "name": "InterfaceIndex",
        "offset": 8,
        "type": "u32"
      },
      {
        "name": "InterfaceGuid",
        "offset": 16,
        "type": "System.Guid"
      },
      {
        "name": "Alias",
        "offset": 32,
        "type": "u16[1]"
      },
      {
        "name": "Description",
        "offset": 40,
        "type": "u16[1]"
      },
      {
        "name": "PhysicalAddressLength",
        "offset": 48,
        "type": "u32"
      },
      {
        "name": "PhysicalAddress",
        "offset": 56,
        "type": "u8[1]"
      },
      {
        "name": "PermanentPhysicalAddress",
        "offset": 64,
        "type": "u8[1]"
      },
      {
        "name": "Mtu",
        "offset": 72,
        "type": "u32"
      },
      {
        "name": "Type",
        "offset": 76,
        "type": "u32"
      },
      {
        "name": "TunnelType",
        "offset": 80,
        "type": "Windows.Win32.NetworkManagement.Ndis.TUNNEL_TYPE"
      },
      {
        "name": "MediaType",
        "offset": 84,
        "type": "Windows.Win32.NetworkManagement.Ndis.NDIS_MEDIUM"
      },
      {
        "name": "PhysicalMediumType",
        "offset": 88,
        "type": "Windows.Win32.NetworkManagement.Ndis.NDIS_PHYSICAL_MEDIUM"
      },
      {
        "name": "AccessType",
        "offset": 92,
        "type": "Windows.Win32.NetworkManagement.Ndis.NET_IF_ACCESS_TYPE"
      },
      {
        "name": "DirectionType",
        "offset": 96,
        "type": "Windows.Win32.NetworkManagement.Ndis.NET_IF_DIRECTION_TYPE"
      },
      {
        "name": "InterfaceAndOperStatusFlags",
        "offset": 104,
        "type": "_InterfaceAndOperStatusFlags_e__Struct"
      },
      {
        "name": "OperStatus",
        "offset": 112,
        "type": "Windows.Win32.NetworkManagement.Ndis.IF_OPER_STATUS"
      },
      {
        "name": "AdminStatus",
        "offset": 116,
        "type": "Windows.Win32.NetworkManagement.Ndis.NET_IF_ADMIN_STATUS"
      },
      {
        "name": "MediaConnectState",
        "offset": 120,
        "type": "Windows.Win32.NetworkManagement.Ndis.NET_IF_MEDIA_CONNECT_STATE"
      },
      {
        "name": "NetworkGuid",
        "offset": 128,
        "type": "System.Guid"
      },
      {
        "name": "ConnectionType",
        "offset": 144,
        "type": "Windows.Win32.NetworkManagement.Ndis.NET_IF_CONNECTION_TYPE"
      },
      {
        "name": "TransmitLinkSpeed",
        "offset": 152,
        "type": "u64"
      },
      {
        "name": "ReceiveLinkSpeed",
        "offset": 160,
        "type": "u64"
      },
      {
        "name": "InOctets",
        "offset": 168,
        "type": "u64"
      },
      {
        "name": "InUcastPkts",
        "offset": 176,
        "type": "u64"
      },
      {
        "name": "InNUcastPkts",
        "offset": 184,
        "type": "u64"
      },
      {
        "name": "InDiscards",
        "offset": 192,
        "type": "u64"
      },
      {
        "name": "InErrors",
        "offset": 200,
        "type": "u64"
      },
      {
        "name": "InUnknownProtos",
        "offset": 208,
        "type": "u64"
      },
      {
        "name": "InUcastOctets",
        "offset": 216,
        "type": "u64"
      },
      {
        "name": "InMulticastOctets",
        "offset": 224,
        "type": "u64"
      },
      {
        "name": "InBroadcastOctets",
        "offset": 232,
        "type": "u64"
      },
      {
        "name": "OutOctets",
        "offset": 240,
        "type": "u64"
      },
      {
        "name": "OutUcastPkts",
        "offset": 248,
        "type": "u64"
      },
      {
        "name": "OutNUcastPkts",
        "offset": 256,
        "type": "u64"
      },
      {
        "name": "OutDiscards",
        "offset": 264,
        "type": "u64"
      },
      {
        "name": "OutErrors",
        "offset": 272,
        "type": "u64"
      },
      {
        "name": "OutUcastOctets",
        "offset": 280,
        "type": "u64"
      },
      {
        "name": "OutMulticastOctets",
        "offset": 288,
        "type": "u64"
      },
      {
        "name": "OutBroadcastOctets",
        "offset": 296,
        "type": "u64"
      },
      {
        "name": "OutQLen",
        "offset": 304,
        "type": "u64"
      }
    ]
  },
  "MIB_IPFORWARD_ROW2": {
    "size": 64,
    "fields": [
      {
        "name": "InterfaceLuid",
        "offset": 0,
        "type": "Windows.Win32.NetworkManagement.Ndis.NET_LUID_LH"
      },
      {
        "name": "InterfaceIndex",
        "offset": 8,
        "type": "u32"
      },
      {
        "name": "DestinationPrefix",
        "offset": 16,
        "type": "Windows.Win32.NetworkManagement.IpHelper.IP_ADDRESS_PREFIX"
      },
      {
        "name": "NextHop",
        "offset": 24,
        "type": "Windows.Win32.Networking.WinSock.SOCKADDR_INET"
      },
      {
        "name": "SitePrefixLength",
        "offset": 32,
        "type": "u8"
      },
      {
        "name": "ValidLifetime",
        "offset": 36,
        "type": "u32"
      },
      {
        "name": "PreferredLifetime",
        "offset": 40,
        "type": "u32"
      },
      {
        "name": "Metric",
        "offset": 44,
        "type": "u32"
      },
      {
        "name": "Protocol",
        "offset": 48,
        "type": "Windows.Win32.Networking.WinSock.NL_ROUTE_PROTOCOL"
      },
      {
        "name": "Loopback",
        "offset": 52,
        "type": "Windows.Win32.Foundation.BOOLEAN"
      },
      {
        "name": "AutoconfigureAddress",
        "offset": 53,
        "type": "Windows.Win32.Foundation.BOOLEAN"
      },
      {
        "name": "Publish",
        "offset": 54,
        "type": "Windows.Win32.Foundation.BOOLEAN"
      },
      {
        "name": "Immortal",
        "offset": 55,
        "type": "Windows.Win32.Foundation.BOOLEAN"
      },
      {
        "name": "Age",
        "offset": 56,
        "type": "u32"
      },
      {
        "name": "Origin",
        "offset": 60,
        "type": "Windows.Win32.Networking.WinSock.NL_ROUTE_ORIGIN"
      }
    ]
  }
} as const;
export const enums = {
  "ADDRESS_FAMILY": {
    "AF_INET": 2,
    "AF_INET6": 23,
    "AF_UNSPEC": 0
  },
  "GET_ADAPTERS_ADDRESSES_FLAGS": {
    "GAA_FLAG_SKIP_UNICAST": 1,
    "GAA_FLAG_SKIP_ANYCAST": 2,
    "GAA_FLAG_SKIP_MULTICAST": 4,
    "GAA_FLAG_SKIP_DNS_SERVER": 8,
    "GAA_FLAG_INCLUDE_PREFIX": 16,
    "GAA_FLAG_SKIP_FRIENDLY_NAME": 32,
    "GAA_FLAG_INCLUDE_WINS_INFO": 64,
    "GAA_FLAG_INCLUDE_GATEWAYS": 128,
    "GAA_FLAG_INCLUDE_ALL_INTERFACES": 256,
    "GAA_FLAG_INCLUDE_ALL_COMPARTMENTS": 512,
    "GAA_FLAG_INCLUDE_TUNNEL_BINDINGORDER": 1024
  },
  "NET_IF_ADMIN_STATUS": {
    "NET_IF_ADMIN_STATUS_UP": 1,
    "NET_IF_ADMIN_STATUS_DOWN": 2,
    "NET_IF_ADMIN_STATUS_TESTING": 3
  },
  "NET_IF_CONNECTION_TYPE": {
    "NET_IF_CONNECTION_DEDICATED": 1,
    "NET_IF_CONNECTION_PASSIVE": 2,
    "NET_IF_CONNECTION_DEMAND": 3,
    "NET_IF_CONNECTION_MAXIMUM": 4
  },
  "TUNNEL_TYPE": {
    "TUNNEL_TYPE_NONE": 0,
    "TUNNEL_TYPE_OTHER": 1,
    "TUNNEL_TYPE_DIRECT": 2,
    "TUNNEL_TYPE_6TO4": 11,
    "TUNNEL_TYPE_ISATAP": 13,
    "TUNNEL_TYPE_TEREDO": 14,
    "TUNNEL_TYPE_IPHTTPS": 15
  },
  "NET_IF_ACCESS_TYPE": {
    "NET_IF_ACCESS_LOOPBACK": 1,
    "NET_IF_ACCESS_BROADCAST": 2,
    "NET_IF_ACCESS_POINT_TO_POINT": 3,
    "NET_IF_ACCESS_POINT_TO_MULTI_POINT": 4,
    "NET_IF_ACCESS_MAXIMUM": 5
  },
  "NET_IF_DIRECTION_TYPE": {
    "NET_IF_DIRECTION_SENDRECEIVE": 0,
    "NET_IF_DIRECTION_SENDONLY": 1,
    "NET_IF_DIRECTION_RECEIVEONLY": 2,
    "NET_IF_DIRECTION_MAXIMUM": 3
  },
  "NET_IF_MEDIA_CONNECT_STATE": {
    "MediaConnectStateUnknown": 0,
    "MediaConnectStateConnected": 1,
    "MediaConnectStateDisconnected": 2
  },
  "IF_OPER_STATUS": {
    "IfOperStatusUp": 1,
    "IfOperStatusDown": 2,
    "IfOperStatusTesting": 3,
    "IfOperStatusUnknown": 4,
    "IfOperStatusDormant": 5,
    "IfOperStatusNotPresent": 6,
    "IfOperStatusLowerLayerDown": 7
  },
  "NDIS_MEDIUM": {
    "NdisMedium802_3": 0,
    "NdisMedium802_5": 1,
    "NdisMediumFddi": 2,
    "NdisMediumWan": 3,
    "NdisMediumLocalTalk": 4,
    "NdisMediumDix": 5,
    "NdisMediumArcnetRaw": 6,
    "NdisMediumArcnet878_2": 7,
    "NdisMediumAtm": 8,
    "NdisMediumWirelessWan": 9,
    "NdisMediumIrda": 10,
    "NdisMediumBpc": 11,
    "NdisMediumCoWan": 12,
    "NdisMedium1394": 13,
    "NdisMediumInfiniBand": 14,
    "NdisMediumTunnel": 15,
    "NdisMediumNative802_11": 16,
    "NdisMediumLoopback": 17,
    "NdisMediumWiMAX": 18,
    "NdisMediumIP": 19,
    "NdisMediumMax": 20
  },
  "NDIS_PHYSICAL_MEDIUM": {
    "NdisPhysicalMediumUnspecified": 0,
    "NdisPhysicalMediumWirelessLan": 1,
    "NdisPhysicalMediumCableModem": 2,
    "NdisPhysicalMediumPhoneLine": 3,
    "NdisPhysicalMediumPowerLine": 4,
    "NdisPhysicalMediumDSL": 5,
    "NdisPhysicalMediumFibreChannel": 6,
    "NdisPhysicalMedium1394": 7,
    "NdisPhysicalMediumWirelessWan": 8,
    "NdisPhysicalMediumNative802_11": 9,
    "NdisPhysicalMediumBluetooth": 10,
    "NdisPhysicalMediumInfiniband": 11,
    "NdisPhysicalMediumWiMax": 12,
    "NdisPhysicalMediumUWB": 13,
    "NdisPhysicalMedium802_3": 14,
    "NdisPhysicalMedium802_5": 15,
    "NdisPhysicalMediumIrda": 16,
    "NdisPhysicalMediumWiredWAN": 17,
    "NdisPhysicalMediumWiredCoWan": 18,
    "NdisPhysicalMediumOther": 19,
    "NdisPhysicalMediumNative802_15_4": 20,
    "NdisPhysicalMediumMax": 21
  },
  "TCP_TABLE_CLASS": {
    "TCP_TABLE_BASIC_LISTENER": 0,
    "TCP_TABLE_BASIC_CONNECTIONS": 1,
    "TCP_TABLE_BASIC_ALL": 2,
    "TCP_TABLE_OWNER_PID_LISTENER": 3,
    "TCP_TABLE_OWNER_PID_CONNECTIONS": 4,
    "TCP_TABLE_OWNER_PID_ALL": 5,
    "TCP_TABLE_OWNER_MODULE_LISTENER": 6,
    "TCP_TABLE_OWNER_MODULE_CONNECTIONS": 7,
    "TCP_TABLE_OWNER_MODULE_ALL": 8
  },
  "UDP_TABLE_CLASS": {
    "UDP_TABLE_BASIC": 0,
    "UDP_TABLE_OWNER_PID": 1,
    "UDP_TABLE_OWNER_MODULE": 2
  },
  "TCPIP_OWNER_MODULE_INFO_CLASS": {
    "TCPIP_OWNER_MODULE_INFO_BASIC": 0
  },
  "TCP_ESTATS_TYPE": {
    "TcpConnectionEstatsSynOpts": 0,
    "TcpConnectionEstatsData": 1,
    "TcpConnectionEstatsSndCong": 2,
    "TcpConnectionEstatsPath": 3,
    "TcpConnectionEstatsSendBuff": 4,
    "TcpConnectionEstatsRec": 5,
    "TcpConnectionEstatsObsRec": 6,
    "TcpConnectionEstatsBandwidth": 7,
    "TcpConnectionEstatsFineRtt": 8,
    "TcpConnectionEstatsMaximum": 9
  },
  "MIB_IF_ENTRY_LEVEL": {
    "MibIfEntryNormal": 0,
    "MibIfEntryNormalWithoutStatistics": 2
  },
  "MIB_IF_TABLE_LEVEL": {
    "MibIfTableNormal": 0,
    "MibIfTableRaw": 1,
    "MibIfTableNormalWithoutStatistics": 2
  },
  "GLOBAL_FILTER": {
    "GF_FRAGMENTS": 2,
    "GF_STRONGHOST": 8,
    "GF_FRAGCACHE": 9
  },
  "PFFORWARD_ACTION": {
    "PF_ACTION_FORWARD": 0,
    "PF_ACTION_DROP": 1
  },
  "PFADDRESSTYPE": {
    "PF_IPV4": 0,
    "PF_IPV6": 1
  },
  "NL_ROUTE_PROTOCOL": {
    "RouteProtocolOther": 1,
    "RouteProtocolLocal": 2,
    "RouteProtocolNetMgmt": 3,
    "RouteProtocolIcmp": 4,
    "RouteProtocolEgp": 5,
    "RouteProtocolGgp": 6,
    "RouteProtocolHello": 7,
    "RouteProtocolRip": 8,
    "RouteProtocolIsIs": 9,
    "RouteProtocolEsIs": 10,
    "RouteProtocolCisco": 11,
    "RouteProtocolBbn": 12,
    "RouteProtocolOspf": 13,
    "RouteProtocolBgp": 14,
    "RouteProtocolIdpr": 15,
    "RouteProtocolEigrp": 16,
    "RouteProtocolDvmrp": 17,
    "RouteProtocolRpl": 18,
    "RouteProtocolDhcp": 19,
    "MIB_IPPROTO_OTHER": 1,
    "PROTO_IP_OTHER": 1,
    "MIB_IPPROTO_LOCAL": 2,
    "PROTO_IP_LOCAL": 2,
    "MIB_IPPROTO_NETMGMT": 3,
    "PROTO_IP_NETMGMT": 3,
    "MIB_IPPROTO_ICMP": 4,
    "PROTO_IP_ICMP": 4,
    "MIB_IPPROTO_EGP": 5,
    "PROTO_IP_EGP": 5,
    "MIB_IPPROTO_GGP": 6,
    "PROTO_IP_GGP": 6,
    "MIB_IPPROTO_HELLO": 7,
    "PROTO_IP_HELLO": 7,
    "MIB_IPPROTO_RIP": 8,
    "PROTO_IP_RIP": 8,
    "MIB_IPPROTO_IS_IS": 9,
    "PROTO_IP_IS_IS": 9,
    "MIB_IPPROTO_ES_IS": 10,
    "PROTO_IP_ES_IS": 10,
    "MIB_IPPROTO_CISCO": 11,
    "PROTO_IP_CISCO": 11,
    "MIB_IPPROTO_BBN": 12,
    "PROTO_IP_BBN": 12,
    "MIB_IPPROTO_OSPF": 13,
    "PROTO_IP_OSPF": 13,
    "MIB_IPPROTO_BGP": 14,
    "PROTO_IP_BGP": 14,
    "MIB_IPPROTO_IDPR": 15,
    "PROTO_IP_IDPR": 15,
    "MIB_IPPROTO_EIGRP": 16,
    "PROTO_IP_EIGRP": 16,
    "MIB_IPPROTO_DVMRP": 17,
    "PROTO_IP_DVMRP": 17,
    "MIB_IPPROTO_RPL": 18,
    "PROTO_IP_RPL": 18,
    "MIB_IPPROTO_DHCP": 19,
    "PROTO_IP_DHCP": 19,
    "MIB_IPPROTO_NT_AUTOSTATIC": 10002,
    "PROTO_IP_NT_AUTOSTATIC": 10002,
    "MIB_IPPROTO_NT_STATIC": 10006,
    "PROTO_IP_NT_STATIC": 10006,
    "MIB_IPPROTO_NT_STATIC_NON_DOD": 10007,
    "PROTO_IP_NT_STATIC_NON_DOD": 10007
  },
  "NL_ROUTE_ORIGIN": {
    "NlroManual": 0,
    "NlroWellKnown": 1,
    "NlroDHCP": 2,
    "NlroRouterAdvertisement": 3,
    "Nlro6to4": 4
  }
} as const;
export const wideAliases = {
  "ConvertInterfaceNameToLuid": "ConvertInterfaceNameToLuidW",
  "ConvertInterfaceLuidToName": "ConvertInterfaceLuidToNameW"
} as const;
export const signatures = {
  "iphlpapi.dll": {
    "IcmpCreateFile": {
      "args": [],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "Icmp6CreateFile": {
      "args": [],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "IcmpCloseHandle": {
      "args": [
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "IcmpSendEcho": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "u32",
        "void*",
        "u16",
        "Windows.Win32.NetworkManagement.IpHelper.IP_OPTION_INFORMATION*",
        "void*",
        "u32",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "IcmpSendEcho2": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.IO.PIO_APC_ROUTINE",
        "void*",
        "u32",
        "void*",
        "u16",
        "Windows.Win32.NetworkManagement.IpHelper.IP_OPTION_INFORMATION*",
        "void*",
        "u32",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "IcmpSendEcho2Ex": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.IO.PIO_APC_ROUTINE",
        "void*",
        "u32",
        "u32",
        "void*",
        "u16",
        "Windows.Win32.NetworkManagement.IpHelper.IP_OPTION_INFORMATION*",
        "void*",
        "u32",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "Icmp6SendEcho2": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.System.IO.PIO_APC_ROUTINE",
        "void*",
        "Windows.Win32.Networking.WinSock.SOCKADDR_IN6*",
        "Windows.Win32.Networking.WinSock.SOCKADDR_IN6*",
        "void*",
        "u16",
        "Windows.Win32.NetworkManagement.IpHelper.IP_OPTION_INFORMATION*",
        "void*",
        "u32",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "IcmpParseReplies": {
      "args": [
        "void*",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "Icmp6ParseReplies": {
      "args": [
        "void*",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetNumberOfInterfaces": {
      "args": [
        "u32*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetIfEntry": {
      "args": [
        "Windows.Win32.NetworkManagement.IpHelper.MIB_IFROW*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetIfTable": {
      "args": [
        "Windows.Win32.NetworkManagement.IpHelper.MIB_IFTABLE*",
        "u32*",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetIpAddrTable": {
      "args": [
        "Windows.Win32.NetworkManagement.IpHelper.MIB_IPADDRTABLE*",
        "u32*",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetIpNetTable": {
      "args": [
        "Windows.Win32.NetworkManagement.IpHelper.MIB_IPNETTABLE*",
        "u32*",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetIpForwardTable": {
      "args": [
        "Windows.Win32.NetworkManagement.IpHelper.MIB_IPFORWARDTABLE*",
        "u32*",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetTcpTable": {
      "args": [
        "Windows.Win32.NetworkManagement.IpHelper.MIB_TCPTABLE*",
        "u32*",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetExtendedTcpTable": {
      "args": [
        "void*",
        "u32*",
        "Windows.Win32.Foundation.BOOL",
        "u32",
        "Windows.Win32.NetworkManagement.IpHelper.TCP_TABLE_CLASS",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetOwnerModuleFromTcpEntry": {
      "args": [
        "Windows.Win32.NetworkManagement.IpHelper.MIB_TCPROW_OWNER_MODULE*",
        "Windows.Win32.NetworkManagement.IpHelper.TCPIP_OWNER_MODULE_INFO_CLASS",
        "void*",
        "u32*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetUdpTable": {
      "args": [
        "Windows.Win32.NetworkManagement.IpHelper.MIB_UDPTABLE*",
        "u32*",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetExtendedUdpTable": {
      "args": [
        "void*",
        "u32*",
        "Windows.Win32.Foundation.BOOL",
        "u32",
        "Windows.Win32.NetworkManagement.IpHelper.UDP_TABLE_CLASS",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetOwnerModuleFromUdpEntry": {
      "args": [
        "Windows.Win32.NetworkManagement.IpHelper.MIB_UDPROW_OWNER_MODULE*",
        "Windows.Win32.NetworkManagement.IpHelper.TCPIP_OWNER_MODULE_INFO_CLASS",
        "void*",
        "u32*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetTcpTable2": {
      "args": [
        "Windows.Win32.NetworkManagement.IpHelper.MIB_TCPTABLE2*",
        "u32*",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetTcp6Table": {
      "args": [
        "Windows.Win32.NetworkManagement.IpHelper.MIB_TCP6TABLE*",
        "u32*",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetTcp6Table2": {
      "args": [
        "Windows.Win32.NetworkManagement.IpHelper.MIB_TCP6TABLE2*",
        "u32*",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetPerTcpConnectionEStats": {
      "args": [
        "Windows.Win32.NetworkManagement.IpHelper.MIB_TCPROW_LH*",
        "Windows.Win32.NetworkManagement.IpHelper.TCP_ESTATS_TYPE",
        "u8*",
        "u32",
        "u32",
        "u8*",
        "u32",
        "u32",
        "u8*",
        "u32",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "SetPerTcpConnectionEStats": {
      "args": [
        "Windows.Win32.NetworkManagement.IpHelper.MIB_TCPROW_LH*",
        "Windows.Win32.NetworkManagement.IpHelper.TCP_ESTATS_TYPE",
        "u8*",
        "u32",
        "u32",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetPerTcp6ConnectionEStats": {
      "args": [
        "Windows.Win32.NetworkManagement.IpHelper.MIB_TCP6ROW*",
        "Windows.Win32.NetworkManagement.IpHelper.TCP_ESTATS_TYPE",
        "u8*",
        "u32",
        "u32",
        "u8*",
        "u32",
        "u32",
        "u8*",
        "u32",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "SetPerTcp6ConnectionEStats": {
      "args": [
        "Windows.Win32.NetworkManagement.IpHelper.MIB_TCP6ROW*",
        "Windows.Win32.NetworkManagement.IpHelper.TCP_ESTATS_TYPE",
        "u8*",
        "u32",
        "u32",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetOwnerModuleFromTcp6Entry": {
      "args": [
        "Windows.Win32.NetworkManagement.IpHelper.MIB_TCP6ROW_OWNER_MODULE*",
        "Windows.Win32.NetworkManagement.IpHelper.TCPIP_OWNER_MODULE_INFO_CLASS",
        "void*",
        "u32*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetUdp6Table": {
      "args": [
        "Windows.Win32.NetworkManagement.IpHelper.MIB_UDP6TABLE*",
        "u32*",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetOwnerModuleFromUdp6Entry": {
      "args": [
        "Windows.Win32.NetworkManagement.IpHelper.MIB_UDP6ROW_OWNER_MODULE*",
        "Windows.Win32.NetworkManagement.IpHelper.TCPIP_OWNER_MODULE_INFO_CLASS",
        "void*",
        "u32*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetOwnerModuleFromPidAndInfo": {
      "args": [
        "u32",
        "u64*",
        "Windows.Win32.NetworkManagement.IpHelper.TCPIP_OWNER_MODULE_INFO_CLASS",
        "void*",
        "u32*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetIpStatistics": {
      "args": [
        "Windows.Win32.NetworkManagement.IpHelper.MIB_IPSTATS_LH*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetIcmpStatistics": {
      "args": [
        "Windows.Win32.NetworkManagement.IpHelper.MIB_ICMP*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetTcpStatistics": {
      "args": [
        "Windows.Win32.NetworkManagement.IpHelper.MIB_TCPSTATS_LH*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetUdpStatistics": {
      "args": [
        "Windows.Win32.NetworkManagement.IpHelper.MIB_UDPSTATS*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "SetIpStatisticsEx": {
      "args": [
        "Windows.Win32.NetworkManagement.IpHelper.MIB_IPSTATS_LH*",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetIpStatisticsEx": {
      "args": [
        "Windows.Win32.NetworkManagement.IpHelper.MIB_IPSTATS_LH*",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetIcmpStatisticsEx": {
      "args": [
        "Windows.Win32.NetworkManagement.IpHelper.MIB_ICMP_EX_XPSP1*",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetTcpStatisticsEx": {
      "args": [
        "Windows.Win32.NetworkManagement.IpHelper.MIB_TCPSTATS_LH*",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetUdpStatisticsEx": {
      "args": [
        "Windows.Win32.NetworkManagement.IpHelper.MIB_UDPSTATS*",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetTcpStatisticsEx2": {
      "args": [
        "Windows.Win32.NetworkManagement.IpHelper.MIB_TCPSTATS2*",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetUdpStatisticsEx2": {
      "args": [
        "Windows.Win32.NetworkManagement.IpHelper.MIB_UDPSTATS2*",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "SetIfEntry": {
      "args": [
        "Windows.Win32.NetworkManagement.IpHelper.MIB_IFROW*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "CreateIpForwardEntry": {
      "args": [
        "Windows.Win32.NetworkManagement.IpHelper.MIB_IPFORWARDROW*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "SetIpForwardEntry": {
      "args": [
        "Windows.Win32.NetworkManagement.IpHelper.MIB_IPFORWARDROW*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "DeleteIpForwardEntry": {
      "args": [
        "Windows.Win32.NetworkManagement.IpHelper.MIB_IPFORWARDROW*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "SetIpStatistics": {
      "args": [
        "Windows.Win32.NetworkManagement.IpHelper.MIB_IPSTATS_LH*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "SetIpTTL": {
      "args": [
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "CreateIpNetEntry": {
      "args": [
        "Windows.Win32.NetworkManagement.IpHelper.MIB_IPNETROW_LH*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "SetIpNetEntry": {
      "args": [
        "Windows.Win32.NetworkManagement.IpHelper.MIB_IPNETROW_LH*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "DeleteIpNetEntry": {
      "args": [
        "Windows.Win32.NetworkManagement.IpHelper.MIB_IPNETROW_LH*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "FlushIpNetTable": {
      "args": [
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "CreateProxyArpEntry": {
      "args": [
        "u32",
        "u32",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "DeleteProxyArpEntry": {
      "args": [
        "u32",
        "u32",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "SetTcpEntry": {
      "args": [
        "Windows.Win32.NetworkManagement.IpHelper.MIB_TCPROW_LH*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetInterfaceInfo": {
      "args": [
        "Windows.Win32.NetworkManagement.IpHelper.IP_INTERFACE_INFO*",
        "u32*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetUniDirectionalAdapterInfo": {
      "args": [
        "Windows.Win32.NetworkManagement.IpHelper.IP_UNIDIRECTIONAL_ADAPTER_ADDRESS*",
        "u32*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "NhpAllocateAndGetInterfaceInfoFromStack": {
      "args": [
        "Windows.Win32.NetworkManagement.IpHelper.IP_INTERFACE_NAME_INFO_W2KSP1**",
        "u32*",
        "Windows.Win32.Foundation.BOOL",
        "Windows.Win32.Foundation.HANDLE",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetBestInterface": {
      "args": [
        "u32",
        "u32*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetBestInterfaceEx": {
      "args": [
        "Windows.Win32.Networking.WinSock.SOCKADDR*",
        "u32*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetBestRoute": {
      "args": [
        "u32",
        "u32",
        "Windows.Win32.NetworkManagement.IpHelper.MIB_IPFORWARDROW*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "NotifyAddrChange": {
      "args": [
        "Windows.Win32.Foundation.HANDLE*",
        "Windows.Win32.System.IO.OVERLAPPED*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "NotifyRouteChange": {
      "args": [
        "Windows.Win32.Foundation.HANDLE*",
        "Windows.Win32.System.IO.OVERLAPPED*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "CancelIPChangeNotify": {
      "args": [
        "Windows.Win32.System.IO.OVERLAPPED*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetAdapterIndex": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "u32*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "AddIPAddress": {
      "args": [
        "u32",
        "u32",
        "u32",
        "u32*",
        "u32*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "DeleteIPAddress": {
      "args": [
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetNetworkParams": {
      "args": [
        "Windows.Win32.NetworkManagement.IpHelper.FIXED_INFO_W2KSP1*",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "GetAdaptersInfo": {
      "args": [
        "Windows.Win32.NetworkManagement.IpHelper.IP_ADAPTER_INFO*",
        "u32*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetAdapterOrderMap": {
      "args": [],
      "returns": "Windows.Win32.NetworkManagement.IpHelper.IP_ADAPTER_ORDER_MAP*",
      "setLastError": false
    },
    "GetAdaptersAddresses": {
      "args": [
        "u32",
        "Windows.Win32.NetworkManagement.IpHelper.GET_ADAPTERS_ADDRESSES_FLAGS",
        "void*",
        "Windows.Win32.NetworkManagement.IpHelper.IP_ADAPTER_ADDRESSES_LH*",
        "u32*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetPerAdapterInfo": {
      "args": [
        "u32",
        "Windows.Win32.NetworkManagement.IpHelper.IP_PER_ADAPTER_INFO_W2KSP1*",
        "u32*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetInterfaceActiveTimestampCapabilities": {
      "args": [
        "Windows.Win32.NetworkManagement.Ndis.NET_LUID_LH*",
        "Windows.Win32.NetworkManagement.IpHelper.INTERFACE_TIMESTAMP_CAPABILITIES*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetInterfaceSupportedTimestampCapabilities": {
      "args": [
        "Windows.Win32.NetworkManagement.Ndis.NET_LUID_LH*",
        "Windows.Win32.NetworkManagement.IpHelper.INTERFACE_TIMESTAMP_CAPABILITIES*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "CaptureInterfaceHardwareCrossTimestamp": {
      "args": [
        "Windows.Win32.NetworkManagement.Ndis.NET_LUID_LH*",
        "Windows.Win32.NetworkManagement.IpHelper.INTERFACE_HARDWARE_CROSSTIMESTAMP*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "RegisterInterfaceTimestampConfigChange": {
      "args": [
        "Windows.Win32.NetworkManagement.IpHelper.PINTERFACE_TIMESTAMP_CONFIG_CHANGE_CALLBACK",
        "void*",
        "Windows.Win32.NetworkManagement.IpHelper.HIFTIMESTAMPCHANGE*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "UnregisterInterfaceTimestampConfigChange": {
      "args": [
        "Windows.Win32.NetworkManagement.IpHelper.HIFTIMESTAMPCHANGE"
      ],
      "returns": "void",
      "setLastError": false
    },
    "GetInterfaceCurrentTimestampCapabilities": {
      "args": [
        "Windows.Win32.NetworkManagement.Ndis.NET_LUID_LH*",
        "Windows.Win32.NetworkManagement.IpHelper.INTERFACE_TIMESTAMP_CAPABILITIES*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetInterfaceHardwareTimestampCapabilities": {
      "args": [
        "Windows.Win32.NetworkManagement.Ndis.NET_LUID_LH*",
        "Windows.Win32.NetworkManagement.IpHelper.INTERFACE_TIMESTAMP_CAPABILITIES*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "NotifyIfTimestampConfigChange": {
      "args": [
        "void*",
        "Windows.Win32.NetworkManagement.IpHelper.PINTERFACE_TIMESTAMP_CONFIG_CHANGE_CALLBACK",
        "Windows.Win32.NetworkManagement.IpHelper.HIFTIMESTAMPCHANGE*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "CancelIfTimestampConfigChange": {
      "args": [
        "Windows.Win32.NetworkManagement.IpHelper.HIFTIMESTAMPCHANGE"
      ],
      "returns": "void",
      "setLastError": false
    },
    "IpReleaseAddress": {
      "args": [
        "Windows.Win32.NetworkManagement.IpHelper.IP_ADAPTER_INDEX_MAP*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "IpRenewAddress": {
      "args": [
        "Windows.Win32.NetworkManagement.IpHelper.IP_ADAPTER_INDEX_MAP*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "SendARP": {
      "args": [
        "u32",
        "u32",
        "void*",
        "u32*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetRTTAndHopCount": {
      "args": [
        "u32",
        "u32*",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetFriendlyIfIndex": {
      "args": [
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "EnableRouter": {
      "args": [
        "Windows.Win32.Foundation.HANDLE*",
        "Windows.Win32.System.IO.OVERLAPPED*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "UnenableRouter": {
      "args": [
        "Windows.Win32.System.IO.OVERLAPPED*",
        "u32*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "DisableMediaSense": {
      "args": [
        "Windows.Win32.Foundation.HANDLE*",
        "Windows.Win32.System.IO.OVERLAPPED*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "RestoreMediaSense": {
      "args": [
        "Windows.Win32.System.IO.OVERLAPPED*",
        "u32*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetIpErrorString": {
      "args": [
        "u32",
        "Windows.Win32.Foundation.PWSTR",
        "u32*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "ResolveNeighbor": {
      "args": [
        "Windows.Win32.Networking.WinSock.SOCKADDR*",
        "void*",
        "u32*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "CreatePersistentTcpPortReservation": {
      "args": [
        "u16",
        "u16",
        "u64*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "CreatePersistentUdpPortReservation": {
      "args": [
        "u16",
        "u16",
        "u64*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "DeletePersistentTcpPortReservation": {
      "args": [
        "u16",
        "u16"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "DeletePersistentUdpPortReservation": {
      "args": [
        "u16",
        "u16"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "LookupPersistentTcpPortReservation": {
      "args": [
        "u16",
        "u16",
        "u64*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "LookupPersistentUdpPortReservation": {
      "args": [
        "u16",
        "u16",
        "u64*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "ParseNetworkString": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "Windows.Win32.NetworkManagement.IpHelper.NET_ADDRESS_INFO*",
        "u16*",
        "u8*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetIfEntry2": {
      "args": [
        "Windows.Win32.NetworkManagement.IpHelper.MIB_IF_ROW2*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "GetIfEntry2Ex": {
      "args": [
        "Windows.Win32.NetworkManagement.IpHelper.MIB_IF_ENTRY_LEVEL",
        "Windows.Win32.NetworkManagement.IpHelper.MIB_IF_ROW2*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "GetIfTable2": {
      "args": [
        "Windows.Win32.NetworkManagement.IpHelper.MIB_IF_TABLE2**"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "GetIfTable2Ex": {
      "args": [
        "Windows.Win32.NetworkManagement.IpHelper.MIB_IF_TABLE_LEVEL",
        "Windows.Win32.NetworkManagement.IpHelper.MIB_IF_TABLE2**"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "GetIfStackTable": {
      "args": [
        "Windows.Win32.NetworkManagement.IpHelper.MIB_IFSTACK_TABLE**"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "GetInvertedIfStackTable": {
      "args": [
        "Windows.Win32.NetworkManagement.IpHelper.MIB_INVERTEDIFSTACK_TABLE**"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "GetIpInterfaceEntry": {
      "args": [
        "Windows.Win32.NetworkManagement.IpHelper.MIB_IPINTERFACE_ROW*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "GetIpInterfaceTable": {
      "args": [
        "Windows.Win32.Networking.WinSock.ADDRESS_FAMILY",
        "Windows.Win32.NetworkManagement.IpHelper.MIB_IPINTERFACE_TABLE**"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "InitializeIpInterfaceEntry": {
      "args": [
        "Windows.Win32.NetworkManagement.IpHelper.MIB_IPINTERFACE_ROW*"
      ],
      "returns": "void",
      "setLastError": false
    },
    "NotifyIpInterfaceChange": {
      "args": [
        "Windows.Win32.Networking.WinSock.ADDRESS_FAMILY",
        "Windows.Win32.NetworkManagement.IpHelper.PIPINTERFACE_CHANGE_CALLBACK",
        "void*",
        "Windows.Win32.Foundation.BOOLEAN",
        "Windows.Win32.Foundation.HANDLE*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "SetIpInterfaceEntry": {
      "args": [
        "Windows.Win32.NetworkManagement.IpHelper.MIB_IPINTERFACE_ROW*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "GetIpNetworkConnectionBandwidthEstimates": {
      "args": [
        "u32",
        "Windows.Win32.Networking.WinSock.ADDRESS_FAMILY",
        "Windows.Win32.NetworkManagement.IpHelper.MIB_IP_NETWORK_CONNECTION_BANDWIDTH_ESTIMATES*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "CreateUnicastIpAddressEntry": {
      "args": [
        "Windows.Win32.NetworkManagement.IpHelper.MIB_UNICASTIPADDRESS_ROW*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "DeleteUnicastIpAddressEntry": {
      "args": [
        "Windows.Win32.NetworkManagement.IpHelper.MIB_UNICASTIPADDRESS_ROW*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "GetUnicastIpAddressEntry": {
      "args": [
        "Windows.Win32.NetworkManagement.IpHelper.MIB_UNICASTIPADDRESS_ROW*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "GetUnicastIpAddressTable": {
      "args": [
        "Windows.Win32.Networking.WinSock.ADDRESS_FAMILY",
        "Windows.Win32.NetworkManagement.IpHelper.MIB_UNICASTIPADDRESS_TABLE**"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "InitializeUnicastIpAddressEntry": {
      "args": [
        "Windows.Win32.NetworkManagement.IpHelper.MIB_UNICASTIPADDRESS_ROW*"
      ],
      "returns": "void",
      "setLastError": false
    },
    "NotifyUnicastIpAddressChange": {
      "args": [
        "Windows.Win32.Networking.WinSock.ADDRESS_FAMILY",
        "Windows.Win32.NetworkManagement.IpHelper.PUNICAST_IPADDRESS_CHANGE_CALLBACK",
        "void*",
        "Windows.Win32.Foundation.BOOLEAN",
        "Windows.Win32.Foundation.HANDLE*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "NotifyStableUnicastIpAddressTable": {
      "args": [
        "Windows.Win32.Networking.WinSock.ADDRESS_FAMILY",
        "Windows.Win32.NetworkManagement.IpHelper.MIB_UNICASTIPADDRESS_TABLE**",
        "Windows.Win32.NetworkManagement.IpHelper.PSTABLE_UNICAST_IPADDRESS_TABLE_CALLBACK",
        "void*",
        "Windows.Win32.Foundation.HANDLE*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "SetUnicastIpAddressEntry": {
      "args": [
        "Windows.Win32.NetworkManagement.IpHelper.MIB_UNICASTIPADDRESS_ROW*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "CreateAnycastIpAddressEntry": {
      "args": [
        "Windows.Win32.NetworkManagement.IpHelper.MIB_ANYCASTIPADDRESS_ROW*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "DeleteAnycastIpAddressEntry": {
      "args": [
        "Windows.Win32.NetworkManagement.IpHelper.MIB_ANYCASTIPADDRESS_ROW*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "GetAnycastIpAddressEntry": {
      "args": [
        "Windows.Win32.NetworkManagement.IpHelper.MIB_ANYCASTIPADDRESS_ROW*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "GetAnycastIpAddressTable": {
      "args": [
        "Windows.Win32.Networking.WinSock.ADDRESS_FAMILY",
        "Windows.Win32.NetworkManagement.IpHelper.MIB_ANYCASTIPADDRESS_TABLE**"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "GetMulticastIpAddressEntry": {
      "args": [
        "Windows.Win32.NetworkManagement.IpHelper.MIB_MULTICASTIPADDRESS_ROW*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "GetMulticastIpAddressTable": {
      "args": [
        "Windows.Win32.Networking.WinSock.ADDRESS_FAMILY",
        "Windows.Win32.NetworkManagement.IpHelper.MIB_MULTICASTIPADDRESS_TABLE**"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "CreateIpForwardEntry2": {
      "args": [
        "Windows.Win32.NetworkManagement.IpHelper.MIB_IPFORWARD_ROW2*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "DeleteIpForwardEntry2": {
      "args": [
        "Windows.Win32.NetworkManagement.IpHelper.MIB_IPFORWARD_ROW2*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "GetBestRoute2": {
      "args": [
        "Windows.Win32.NetworkManagement.Ndis.NET_LUID_LH*",
        "u32",
        "Windows.Win32.Networking.WinSock.SOCKADDR_INET*",
        "Windows.Win32.Networking.WinSock.SOCKADDR_INET*",
        "u32",
        "Windows.Win32.NetworkManagement.IpHelper.MIB_IPFORWARD_ROW2*",
        "Windows.Win32.Networking.WinSock.SOCKADDR_INET*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "GetIpForwardEntry2": {
      "args": [
        "Windows.Win32.NetworkManagement.IpHelper.MIB_IPFORWARD_ROW2*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "GetIpForwardTable2": {
      "args": [
        "Windows.Win32.Networking.WinSock.ADDRESS_FAMILY",
        "Windows.Win32.NetworkManagement.IpHelper.MIB_IPFORWARD_TABLE2**"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "InitializeIpForwardEntry": {
      "args": [
        "Windows.Win32.NetworkManagement.IpHelper.MIB_IPFORWARD_ROW2*"
      ],
      "returns": "void",
      "setLastError": false
    },
    "NotifyRouteChange2": {
      "args": [
        "Windows.Win32.Networking.WinSock.ADDRESS_FAMILY",
        "Windows.Win32.NetworkManagement.IpHelper.PIPFORWARD_CHANGE_CALLBACK",
        "void*",
        "Windows.Win32.Foundation.BOOLEAN",
        "Windows.Win32.Foundation.HANDLE*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "SetIpForwardEntry2": {
      "args": [
        "Windows.Win32.NetworkManagement.IpHelper.MIB_IPFORWARD_ROW2*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "FlushIpPathTable": {
      "args": [
        "Windows.Win32.Networking.WinSock.ADDRESS_FAMILY"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "GetIpPathEntry": {
      "args": [
        "Windows.Win32.NetworkManagement.IpHelper.MIB_IPPATH_ROW*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "GetIpPathTable": {
      "args": [
        "Windows.Win32.Networking.WinSock.ADDRESS_FAMILY",
        "Windows.Win32.NetworkManagement.IpHelper.MIB_IPPATH_TABLE**"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "CreateIpNetEntry2": {
      "args": [
        "Windows.Win32.NetworkManagement.IpHelper.MIB_IPNET_ROW2*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "DeleteIpNetEntry2": {
      "args": [
        "Windows.Win32.NetworkManagement.IpHelper.MIB_IPNET_ROW2*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "FlushIpNetTable2": {
      "args": [
        "Windows.Win32.Networking.WinSock.ADDRESS_FAMILY",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "GetIpNetEntry2": {
      "args": [
        "Windows.Win32.NetworkManagement.IpHelper.MIB_IPNET_ROW2*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "GetIpNetTable2": {
      "args": [
        "Windows.Win32.Networking.WinSock.ADDRESS_FAMILY",
        "Windows.Win32.NetworkManagement.IpHelper.MIB_IPNET_TABLE2**"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "ResolveIpNetEntry2": {
      "args": [
        "Windows.Win32.NetworkManagement.IpHelper.MIB_IPNET_ROW2*",
        "Windows.Win32.Networking.WinSock.SOCKADDR_INET*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "SetIpNetEntry2": {
      "args": [
        "Windows.Win32.NetworkManagement.IpHelper.MIB_IPNET_ROW2*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "NotifyTeredoPortChange": {
      "args": [
        "Windows.Win32.NetworkManagement.IpHelper.PTEREDO_PORT_CHANGE_CALLBACK",
        "void*",
        "Windows.Win32.Foundation.BOOLEAN",
        "Windows.Win32.Foundation.HANDLE*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "GetTeredoPort": {
      "args": [
        "u16*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "CancelMibChangeNotify2": {
      "args": [
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "FreeMibTable": {
      "args": [
        "void*"
      ],
      "returns": "void",
      "setLastError": false
    },
    "CreateSortedAddressPairs": {
      "args": [
        "Windows.Win32.Networking.WinSock.SOCKADDR_IN6*",
        "u32",
        "Windows.Win32.Networking.WinSock.SOCKADDR_IN6*",
        "u32",
        "u32",
        "Windows.Win32.Networking.WinSock.SOCKADDR_IN6_PAIR**",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "ConvertCompartmentGuidToId": {
      "args": [
        "System.Guid*",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "ConvertCompartmentIdToGuid": {
      "args": [
        "Windows.Win32.NetworkManagement.Ndis.NET_IF_COMPARTMENT_ID",
        "System.Guid*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "ConvertInterfaceNameToLuidA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.NetworkManagement.Ndis.NET_LUID_LH*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "ConvertInterfaceNameToLuidW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.NetworkManagement.Ndis.NET_LUID_LH*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "ConvertInterfaceLuidToNameA": {
      "args": [
        "Windows.Win32.NetworkManagement.Ndis.NET_LUID_LH*",
        "Windows.Win32.Foundation.PSTR",
        "usize"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "ConvertInterfaceLuidToNameW": {
      "args": [
        "Windows.Win32.NetworkManagement.Ndis.NET_LUID_LH*",
        "Windows.Win32.Foundation.PWSTR",
        "usize"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "ConvertInterfaceLuidToIndex": {
      "args": [
        "Windows.Win32.NetworkManagement.Ndis.NET_LUID_LH*",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "ConvertInterfaceIndexToLuid": {
      "args": [
        "u32",
        "Windows.Win32.NetworkManagement.Ndis.NET_LUID_LH*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "ConvertInterfaceLuidToAlias": {
      "args": [
        "Windows.Win32.NetworkManagement.Ndis.NET_LUID_LH*",
        "Windows.Win32.Foundation.PWSTR",
        "usize"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "ConvertInterfaceAliasToLuid": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.NetworkManagement.Ndis.NET_LUID_LH*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "ConvertInterfaceLuidToGuid": {
      "args": [
        "Windows.Win32.NetworkManagement.Ndis.NET_LUID_LH*",
        "System.Guid*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "ConvertInterfaceGuidToLuid": {
      "args": [
        "System.Guid*",
        "Windows.Win32.NetworkManagement.Ndis.NET_LUID_LH*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "if_nametoindex": {
      "args": [
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "if_indextoname": {
      "args": [
        "u32",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.PSTR",
      "setLastError": false
    },
    "GetCurrentThreadCompartmentId": {
      "args": [],
      "returns": "Windows.Win32.NetworkManagement.Ndis.NET_IF_COMPARTMENT_ID",
      "setLastError": false
    },
    "SetCurrentThreadCompartmentId": {
      "args": [
        "Windows.Win32.NetworkManagement.Ndis.NET_IF_COMPARTMENT_ID"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "GetCurrentThreadCompartmentScope": {
      "args": [
        "u32*",
        "u32*"
      ],
      "returns": "void",
      "setLastError": false
    },
    "SetCurrentThreadCompartmentScope": {
      "args": [
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "GetJobCompartmentId": {
      "args": [
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "Windows.Win32.NetworkManagement.Ndis.NET_IF_COMPARTMENT_ID",
      "setLastError": false
    },
    "SetJobCompartmentId": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.NetworkManagement.Ndis.NET_IF_COMPARTMENT_ID"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "GetSessionCompartmentId": {
      "args": [
        "u32"
      ],
      "returns": "Windows.Win32.NetworkManagement.Ndis.NET_IF_COMPARTMENT_ID",
      "setLastError": false
    },
    "SetSessionCompartmentId": {
      "args": [
        "u32",
        "Windows.Win32.NetworkManagement.Ndis.NET_IF_COMPARTMENT_ID"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "GetDefaultCompartmentId": {
      "args": [],
      "returns": "Windows.Win32.NetworkManagement.Ndis.NET_IF_COMPARTMENT_ID",
      "setLastError": false
    },
    "GetNetworkInformation": {
      "args": [
        "System.Guid*",
        "u32*",
        "u32*",
        "Windows.Win32.Foundation.PWSTR",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "SetNetworkInformation": {
      "args": [
        "System.Guid*",
        "Windows.Win32.NetworkManagement.Ndis.NET_IF_COMPARTMENT_ID",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "ConvertLengthToIpv4Mask": {
      "args": [
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "ConvertIpv4MaskToLength": {
      "args": [
        "u32",
        "u8*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "GetDnsSettings": {
      "args": [
        "Windows.Win32.NetworkManagement.IpHelper.DNS_SETTINGS*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "FreeDnsSettings": {
      "args": [
        "Windows.Win32.NetworkManagement.IpHelper.DNS_SETTINGS*"
      ],
      "returns": "void",
      "setLastError": false
    },
    "SetDnsSettings": {
      "args": [
        "Windows.Win32.NetworkManagement.IpHelper.DNS_SETTINGS*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "GetInterfaceDnsSettings": {
      "args": [
        "System.Guid",
        "Windows.Win32.NetworkManagement.IpHelper.DNS_INTERFACE_SETTINGS*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "FreeInterfaceDnsSettings": {
      "args": [
        "Windows.Win32.NetworkManagement.IpHelper.DNS_INTERFACE_SETTINGS*"
      ],
      "returns": "void",
      "setLastError": false
    },
    "SetInterfaceDnsSettings": {
      "args": [
        "System.Guid",
        "Windows.Win32.NetworkManagement.IpHelper.DNS_INTERFACE_SETTINGS*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "GetNetworkConnectivityHint": {
      "args": [
        "Windows.Win32.Networking.WinSock.NL_NETWORK_CONNECTIVITY_HINT*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "GetNetworkConnectivityHintForInterface": {
      "args": [
        "u32",
        "Windows.Win32.Networking.WinSock.NL_NETWORK_CONNECTIVITY_HINT*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "NotifyNetworkConnectivityHintChange": {
      "args": [
        "Windows.Win32.NetworkManagement.IpHelper.PNETWORK_CONNECTIVITY_HINT_CHANGE_CALLBACK",
        "void*",
        "Windows.Win32.Foundation.BOOLEAN",
        "Windows.Win32.Foundation.HANDLE*"
      ],
      "returns": "Windows.Win32.Foundation.WIN32_ERROR",
      "setLastError": false
    },
    "CreateFlVirtualInterface": {
      "args": [
        "Windows.Win32.NetworkManagement.IpHelper.MIB_FL_VIRTUAL_INTERFACE_ROW*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "DeleteFlVirtualInterface": {
      "args": [
        "Windows.Win32.NetworkManagement.IpHelper.MIB_FL_VIRTUAL_INTERFACE_ROW*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "InitializeFlVirtualInterfaceEntry": {
      "args": [
        "Windows.Win32.NetworkManagement.IpHelper.MIB_FL_VIRTUAL_INTERFACE_ROW*"
      ],
      "returns": "void",
      "setLastError": false
    },
    "SetFlVirtualInterface": {
      "args": [
        "Windows.Win32.NetworkManagement.IpHelper.MIB_FL_VIRTUAL_INTERFACE_ROW*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetFlVirtualInterface": {
      "args": [
        "Windows.Win32.NetworkManagement.IpHelper.MIB_FL_VIRTUAL_INTERFACE_ROW*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetFlVirtualInterfaceTable": {
      "args": [
        "Windows.Win32.Networking.WinSock.ADDRESS_FAMILY",
        "Windows.Win32.NetworkManagement.IpHelper.MIB_FL_VIRTUAL_INTERFACE_TABLE**"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "PfCreateInterface": {
      "args": [
        "u32",
        "Windows.Win32.NetworkManagement.IpHelper.PFFORWARD_ACTION",
        "Windows.Win32.NetworkManagement.IpHelper.PFFORWARD_ACTION",
        "Windows.Win32.Foundation.BOOL",
        "Windows.Win32.Foundation.BOOL",
        "void**"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "PfDeleteInterface": {
      "args": [
        "void*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "PfAddFiltersToInterface": {
      "args": [
        "void*",
        "u32",
        "Windows.Win32.NetworkManagement.IpHelper.PF_FILTER_DESCRIPTOR*",
        "u32",
        "Windows.Win32.NetworkManagement.IpHelper.PF_FILTER_DESCRIPTOR*",
        "void**"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "PfRemoveFiltersFromInterface": {
      "args": [
        "void*",
        "u32",
        "Windows.Win32.NetworkManagement.IpHelper.PF_FILTER_DESCRIPTOR*",
        "u32",
        "Windows.Win32.NetworkManagement.IpHelper.PF_FILTER_DESCRIPTOR*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "PfRemoveFilterHandles": {
      "args": [
        "void*",
        "u32",
        "void**"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "PfUnBindInterface": {
      "args": [
        "void*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "PfBindInterfaceToIndex": {
      "args": [
        "void*",
        "u32",
        "Windows.Win32.NetworkManagement.IpHelper.PFADDRESSTYPE",
        "u8*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "PfBindInterfaceToIPAddress": {
      "args": [
        "void*",
        "Windows.Win32.NetworkManagement.IpHelper.PFADDRESSTYPE",
        "u8*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "PfRebindFilters": {
      "args": [
        "void*",
        "Windows.Win32.NetworkManagement.IpHelper.PF_LATEBIND_INFO*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "PfAddGlobalFilterToInterface": {
      "args": [
        "void*",
        "Windows.Win32.NetworkManagement.IpHelper.GLOBAL_FILTER"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "PfRemoveGlobalFilterFromInterface": {
      "args": [
        "void*",
        "Windows.Win32.NetworkManagement.IpHelper.GLOBAL_FILTER"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "PfMakeLog": {
      "args": [
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "PfSetLogBuffer": {
      "args": [
        "u8*",
        "u32",
        "u32",
        "u32",
        "u32*",
        "u32*",
        "u32*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "PfDeleteLog": {
      "args": [],
      "returns": "u32",
      "setLastError": false
    },
    "PfGetInterfaceStatistics": {
      "args": [
        "void*",
        "Windows.Win32.NetworkManagement.IpHelper.PF_INTERFACE_STATS*",
        "u32*",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "PfTestPacket": {
      "args": [
        "void*",
        "void*",
        "u32",
        "u8*",
        "Windows.Win32.NetworkManagement.IpHelper.PFFORWARD_ACTION*"
      ],
      "returns": "u32",
      "setLastError": false
    }
  }
} as const;
const libraries = {
  "iphlpapi.dll": {
    "IcmpCreateFile": {
      "args": [],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "Icmp6CreateFile": {
      "args": [],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "IcmpCloseHandle": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "IcmpSendEcho": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u16",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "IcmpSendEcho2": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u16",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "IcmpSendEcho2Ex": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u16",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "Icmp6SendEcho2": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u16",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "IcmpParseReplies": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "Icmp6ParseReplies": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "GetNumberOfInterfaces": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "GetIfEntry": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "GetIfTable": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.i32"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "GetIpAddrTable": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.i32"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "GetIpNetTable": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.i32"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "GetIpForwardTable": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.i32"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "GetTcpTable": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.i32"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "GetExtendedTcpTable": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.u32",
        "FFIType.i32",
        "FFIType.u32"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "GetOwnerModuleFromTcpEntry": {
      "args": [
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "GetUdpTable": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.i32"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "GetExtendedUdpTable": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.u32",
        "FFIType.i32",
        "FFIType.u32"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "GetOwnerModuleFromUdpEntry": {
      "args": [
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "GetTcpTable2": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.i32"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "GetTcp6Table": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.i32"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "GetTcp6Table2": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.i32"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "GetPerTcpConnectionEStats": {
      "args": [
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "SetPerTcpConnectionEStats": {
      "args": [
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.u32"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "GetPerTcp6ConnectionEStats": {
      "args": [
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "SetPerTcp6ConnectionEStats": {
      "args": [
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.u32"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "GetOwnerModuleFromTcp6Entry": {
      "args": [
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "GetUdp6Table": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.i32"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "GetOwnerModuleFromUdp6Entry": {
      "args": [
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "GetOwnerModuleFromPidAndInfo": {
      "args": [
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "GetIpStatistics": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "GetIcmpStatistics": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "GetTcpStatistics": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "GetUdpStatistics": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "SetIpStatisticsEx": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "GetIpStatisticsEx": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "GetIcmpStatisticsEx": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "GetTcpStatisticsEx": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "GetUdpStatisticsEx": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "GetTcpStatisticsEx2": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "GetUdpStatisticsEx2": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "SetIfEntry": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "CreateIpForwardEntry": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "SetIpForwardEntry": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "DeleteIpForwardEntry": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "SetIpStatistics": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "SetIpTTL": {
      "args": [
        "FFIType.u32"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "CreateIpNetEntry": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "SetIpNetEntry": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "DeleteIpNetEntry": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "FlushIpNetTable": {
      "args": [
        "FFIType.u32"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "CreateProxyArpEntry": {
      "args": [
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.u32"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "DeleteProxyArpEntry": {
      "args": [
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.u32"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "SetTcpEntry": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "GetInterfaceInfo": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "GetUniDirectionalAdapterInfo": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "NhpAllocateAndGetInterfaceInfoFromStack": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "GetBestInterface": {
      "args": [
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "GetBestInterfaceEx": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "GetBestRoute": {
      "args": [
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "NotifyAddrChange": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "NotifyRouteChange": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "CancelIPChangeNotify": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "GetAdapterIndex": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "AddIPAddress": {
      "args": [
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "DeleteIPAddress": {
      "args": [
        "FFIType.u32"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "GetNetworkParams": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "GetAdaptersInfo": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "GetAdapterOrderMap": {
      "args": [],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "GetAdaptersAddresses": {
      "args": [
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "GetPerAdapterInfo": {
      "args": [
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "GetInterfaceActiveTimestampCapabilities": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "GetInterfaceSupportedTimestampCapabilities": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "CaptureInterfaceHardwareCrossTimestamp": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "RegisterInterfaceTimestampConfigChange": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "UnregisterInterfaceTimestampConfigChange": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.void",
      "setLastError": false
    },
    "GetInterfaceCurrentTimestampCapabilities": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "GetInterfaceHardwareTimestampCapabilities": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "NotifyIfTimestampConfigChange": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "CancelIfTimestampConfigChange": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.void",
      "setLastError": false
    },
    "IpReleaseAddress": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "IpRenewAddress": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "SendARP": {
      "args": [
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "GetRTTAndHopCount": {
      "args": [
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "GetFriendlyIfIndex": {
      "args": [
        "FFIType.u32"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "EnableRouter": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "UnenableRouter": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "DisableMediaSense": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "RestoreMediaSense": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "GetIpErrorString": {
      "args": [
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "ResolveNeighbor": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "CreatePersistentTcpPortReservation": {
      "args": [
        "FFIType.u16",
        "FFIType.u16",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "CreatePersistentUdpPortReservation": {
      "args": [
        "FFIType.u16",
        "FFIType.u16",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "DeletePersistentTcpPortReservation": {
      "args": [
        "FFIType.u16",
        "FFIType.u16"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "DeletePersistentUdpPortReservation": {
      "args": [
        "FFIType.u16",
        "FFIType.u16"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "LookupPersistentTcpPortReservation": {
      "args": [
        "FFIType.u16",
        "FFIType.u16",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "LookupPersistentUdpPortReservation": {
      "args": [
        "FFIType.u16",
        "FFIType.u16",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "ParseNetworkString": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "GetIfEntry2": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "GetIfEntry2Ex": {
      "args": [
        "FFIType.i32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "GetIfTable2": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "GetIfTable2Ex": {
      "args": [
        "FFIType.i32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "GetIfStackTable": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "GetInvertedIfStackTable": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "GetIpInterfaceEntry": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "GetIpInterfaceTable": {
      "args": [
        "FFIType.u16",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "InitializeIpInterfaceEntry": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.void",
      "setLastError": false
    },
    "NotifyIpInterfaceChange": {
      "args": [
        "FFIType.u16",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u8",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "SetIpInterfaceEntry": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "GetIpNetworkConnectionBandwidthEstimates": {
      "args": [
        "FFIType.u32",
        "FFIType.u16",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "CreateUnicastIpAddressEntry": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "DeleteUnicastIpAddressEntry": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "GetUnicastIpAddressEntry": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "GetUnicastIpAddressTable": {
      "args": [
        "FFIType.u16",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "InitializeUnicastIpAddressEntry": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.void",
      "setLastError": false
    },
    "NotifyUnicastIpAddressChange": {
      "args": [
        "FFIType.u16",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u8",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "NotifyStableUnicastIpAddressTable": {
      "args": [
        "FFIType.u16",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "SetUnicastIpAddressEntry": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "CreateAnycastIpAddressEntry": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "DeleteAnycastIpAddressEntry": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "GetAnycastIpAddressEntry": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "GetAnycastIpAddressTable": {
      "args": [
        "FFIType.u16",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "GetMulticastIpAddressEntry": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "GetMulticastIpAddressTable": {
      "args": [
        "FFIType.u16",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "CreateIpForwardEntry2": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "DeleteIpForwardEntry2": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "GetBestRoute2": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "GetIpForwardEntry2": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "GetIpForwardTable2": {
      "args": [
        "FFIType.u16",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "InitializeIpForwardEntry": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.void",
      "setLastError": false
    },
    "NotifyRouteChange2": {
      "args": [
        "FFIType.u16",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u8",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "SetIpForwardEntry2": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "FlushIpPathTable": {
      "args": [
        "FFIType.u16"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "GetIpPathEntry": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "GetIpPathTable": {
      "args": [
        "FFIType.u16",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "CreateIpNetEntry2": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "DeleteIpNetEntry2": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "FlushIpNetTable2": {
      "args": [
        "FFIType.u16",
        "FFIType.u32"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "GetIpNetEntry2": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "GetIpNetTable2": {
      "args": [
        "FFIType.u16",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "ResolveIpNetEntry2": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "SetIpNetEntry2": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "NotifyTeredoPortChange": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u8",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "GetTeredoPort": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "CancelMibChangeNotify2": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "FreeMibTable": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.void",
      "setLastError": false
    },
    "CreateSortedAddressPairs": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "ConvertCompartmentGuidToId": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "ConvertCompartmentIdToGuid": {
      "args": [
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "ConvertInterfaceNameToLuidA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "ConvertInterfaceNameToLuidW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "ConvertInterfaceLuidToNameA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.usize"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "ConvertInterfaceLuidToNameW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.usize"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "ConvertInterfaceLuidToIndex": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "ConvertInterfaceIndexToLuid": {
      "args": [
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "ConvertInterfaceLuidToAlias": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.usize"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "ConvertInterfaceAliasToLuid": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "ConvertInterfaceLuidToGuid": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "ConvertInterfaceGuidToLuid": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "if_nametoindex": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "if_indextoname": {
      "args": [
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "GetCurrentThreadCompartmentId": {
      "args": [],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "SetCurrentThreadCompartmentId": {
      "args": [
        "FFIType.u32"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "GetCurrentThreadCompartmentScope": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.void",
      "setLastError": false
    },
    "SetCurrentThreadCompartmentScope": {
      "args": [
        "FFIType.u32"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "GetJobCompartmentId": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "SetJobCompartmentId": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "GetSessionCompartmentId": {
      "args": [
        "FFIType.u32"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "SetSessionCompartmentId": {
      "args": [
        "FFIType.u32",
        "FFIType.u32"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "GetDefaultCompartmentId": {
      "args": [],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "GetNetworkInformation": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "SetNetworkInformation": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "ConvertLengthToIpv4Mask": {
      "args": [
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "ConvertIpv4MaskToLength": {
      "args": [
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "GetDnsSettings": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "FreeDnsSettings": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.void",
      "setLastError": false
    },
    "SetDnsSettings": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "GetInterfaceDnsSettings": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "FreeInterfaceDnsSettings": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.void",
      "setLastError": false
    },
    "SetInterfaceDnsSettings": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "GetNetworkConnectivityHint": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "GetNetworkConnectivityHintForInterface": {
      "args": [
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "NotifyNetworkConnectivityHintChange": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u8",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "CreateFlVirtualInterface": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "DeleteFlVirtualInterface": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "InitializeFlVirtualInterfaceEntry": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.void",
      "setLastError": false
    },
    "SetFlVirtualInterface": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "GetFlVirtualInterface": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "GetFlVirtualInterfaceTable": {
      "args": [
        "FFIType.u16",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "PfCreateInterface": {
      "args": [
        "FFIType.u32",
        "FFIType.i32",
        "FFIType.i32",
        "FFIType.i32",
        "FFIType.i32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "PfDeleteInterface": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "PfAddFiltersToInterface": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "PfRemoveFiltersFromInterface": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "PfRemoveFilterHandles": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "PfUnBindInterface": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "PfBindInterfaceToIndex": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.i32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "PfBindInterfaceToIPAddress": {
      "args": [
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "PfRebindFilters": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "PfAddGlobalFilterToInterface": {
      "args": [
        "FFIType.ptr",
        "FFIType.i32"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "PfRemoveGlobalFilterFromInterface": {
      "args": [
        "FFIType.ptr",
        "FFIType.i32"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "PfMakeLog": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "PfSetLogBuffer": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "PfDeleteLog": {
      "args": [],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "PfGetInterfaceStatistics": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.i32"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "PfTestPacket": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    }
  }
} as const;
const defaults = {
  "iphlpapi.dll": {
    "ConvertInterfaceNameToLuid": "ConvertInterfaceNameToLuidW",
    "ConvertInterfaceLuidToName": "ConvertInterfaceLuidToNameW"
  }
} as const;

export function open() {
  const result: Record<string, unknown> = {};
  for (const [dll, symbols] of Object.entries(libraries)) {
    const library = dlopen(dll, symbols as any);
    const defaultSymbols = { ...library.symbols };
    for (const [alias, wide] of Object.entries(defaults[dll as keyof typeof defaults] ?? {})) defaultSymbols[alias] = defaultSymbols[wide];
    result[dll] = { ...library, symbols: defaultSymbols };
  }
  return result as { "iphlpapi.dll": iphlpapiLibrary };
}
