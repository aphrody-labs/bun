import { dlopen, FFIType } from "bun:ffi";

export type Pointer = number | bigint | ArrayBuffer | ArrayBufferView;
export const structs = {
  "ITEMIDLIST": {
    "size": 8,
    "fields": [
      {
        "name": "mkid",
        "offset": 0,
        "type": "Windows.Win32.UI.Shell.Common.SHITEMID"
      }
    ]
  }
} as const;
export const enums = {
  "FILE_FLAGS_AND_ATTRIBUTES": {
    "FILE_ATTRIBUTE_READONLY": 1,
    "FILE_ATTRIBUTE_HIDDEN": 2,
    "FILE_ATTRIBUTE_SYSTEM": 4,
    "FILE_ATTRIBUTE_DIRECTORY": 16,
    "FILE_ATTRIBUTE_ARCHIVE": 32,
    "FILE_ATTRIBUTE_DEVICE": 64,
    "FILE_ATTRIBUTE_NORMAL": 128,
    "FILE_ATTRIBUTE_TEMPORARY": 256,
    "FILE_ATTRIBUTE_SPARSE_FILE": 512,
    "FILE_ATTRIBUTE_REPARSE_POINT": 1024,
    "FILE_ATTRIBUTE_COMPRESSED": 2048,
    "FILE_ATTRIBUTE_OFFLINE": 4096,
    "FILE_ATTRIBUTE_NOT_CONTENT_INDEXED": 8192,
    "FILE_ATTRIBUTE_ENCRYPTED": 16384,
    "FILE_ATTRIBUTE_INTEGRITY_STREAM": 32768,
    "FILE_ATTRIBUTE_VIRTUAL": 65536,
    "FILE_ATTRIBUTE_NO_SCRUB_DATA": 131072,
    "FILE_ATTRIBUTE_EA": 262144,
    "FILE_ATTRIBUTE_PINNED": 524288,
    "FILE_ATTRIBUTE_UNPINNED": 1048576,
    "FILE_ATTRIBUTE_RECALL_ON_OPEN": 262144,
    "FILE_ATTRIBUTE_RECALL_ON_DATA_ACCESS": 4194304,
    "FILE_FLAG_WRITE_THROUGH": 2147483648,
    "FILE_FLAG_OVERLAPPED": 1073741824,
    "FILE_FLAG_NO_BUFFERING": 536870912,
    "FILE_FLAG_RANDOM_ACCESS": 268435456,
    "FILE_FLAG_SEQUENTIAL_SCAN": 134217728,
    "FILE_FLAG_DELETE_ON_CLOSE": 67108864,
    "FILE_FLAG_BACKUP_SEMANTICS": 33554432,
    "FILE_FLAG_POSIX_SEMANTICS": 16777216,
    "FILE_FLAG_SESSION_AWARE": 8388608,
    "FILE_FLAG_OPEN_REPARSE_POINT": 2097152,
    "FILE_FLAG_OPEN_NO_RECALL": 1048576,
    "FILE_FLAG_FIRST_PIPE_INSTANCE": 524288,
    "PIPE_ACCESS_DUPLEX": 3,
    "PIPE_ACCESS_INBOUND": 1,
    "PIPE_ACCESS_OUTBOUND": 2,
    "SECURITY_ANONYMOUS": 0,
    "SECURITY_IDENTIFICATION": 65536,
    "SECURITY_IMPERSONATION": 131072,
    "SECURITY_DELEGATION": 196608,
    "SECURITY_CONTEXT_TRACKING": 262144,
    "SECURITY_EFFECTIVE_ONLY": 524288,
    "SECURITY_SQOS_PRESENT": 1048576,
    "SECURITY_VALID_SQOS_FLAGS": 2031616
  },
  "SHGFI_FLAGS": {
    "SHGFI_ADDOVERLAYS": 32,
    "SHGFI_ATTR_SPECIFIED": 131072,
    "SHGFI_ATTRIBUTES": 2048,
    "SHGFI_DISPLAYNAME": 512,
    "SHGFI_EXETYPE": 8192,
    "SHGFI_ICON": 256,
    "SHGFI_ICONLOCATION": 4096,
    "SHGFI_LARGEICON": 0,
    "SHGFI_LINKOVERLAY": 32768,
    "SHGFI_OPENICON": 2,
    "SHGFI_OVERLAYINDEX": 64,
    "SHGFI_PIDL": 8,
    "SHGFI_SELECTED": 65536,
    "SHGFI_SHELLICONSIZE": 4,
    "SHGFI_SMALLICON": 1,
    "SHGFI_SYSICONINDEX": 16384,
    "SHGFI_TYPENAME": 1024,
    "SHGFI_USEFILEATTRIBUTES": 16
  },
  "SHCNRF_SOURCE": {
    "SHCNRF_InterruptLevel": 1,
    "SHCNRF_ShellLevel": 2,
    "SHCNRF_RecursiveInterrupt": 4096,
    "SHCNRF_NewDelivery": 32768
  },
  "SHCNF_FLAGS": {
    "SHCNF_IDLIST": 0,
    "SHCNF_PATHA": 1,
    "SHCNF_PRINTERA": 2,
    "SHCNF_DWORD": 3,
    "SHCNF_PATHW": 5,
    "SHCNF_PRINTERW": 6,
    "SHCNF_TYPE": 255,
    "SHCNF_FLUSH": 4096,
    "SHCNF_FLUSHNOWAIT": 12288,
    "SHCNF_NOTIFYRECURSIVE": 65536,
    "SHCNF_PATH": 5,
    "SHCNF_PRINTER": 6
  },
  "SHGDFIL_FORMAT": {
    "SHGDFIL_FINDDATA": 1,
    "SHGDFIL_NETRESOURCE": 2,
    "SHGDFIL_DESCRIPTIONID": 3
  },
  "MM_FLAGS": {
    "MM_ADDSEPARATOR": 1,
    "MM_SUBMENUSHAVEIDS": 2,
    "MM_DONTREMOVESEPS": 4
  },
  "SHFMT_ID": {
    "SHFMT_ID_DEFAULT": 65535
  },
  "SSF_MASK": {
    "SSF_SHOWALLOBJECTS": 1,
    "SSF_SHOWEXTENSIONS": 2,
    "SSF_HIDDENFILEEXTS": 4,
    "SSF_SERVERADMINUI": 4,
    "SSF_SHOWCOMPCOLOR": 8,
    "SSF_SORTCOLUMNS": 16,
    "SSF_SHOWSYSFILES": 32,
    "SSF_DOUBLECLICKINWEBVIEW": 128,
    "SSF_SHOWATTRIBCOL": 256,
    "SSF_DESKTOPHTML": 512,
    "SSF_WIN95CLASSIC": 1024,
    "SSF_DONTPRETTYPATH": 2048,
    "SSF_SHOWINFOTIP": 8192,
    "SSF_MAPNETDRVBUTTON": 4096,
    "SSF_NOCONFIRMRECYCLE": 32768,
    "SSF_HIDEICONS": 16384,
    "SSF_FILTER": 65536,
    "SSF_WEBVIEW": 131072,
    "SSF_SHOWSUPERHIDDEN": 262144,
    "SSF_SEPPROCESS": 524288,
    "SSF_NONETCRAWLING": 1048576,
    "SSF_STARTPANELON": 2097152,
    "SSF_SHOWSTARTPAGE": 4194304,
    "SSF_AUTOCHECKSELECT": 8388608,
    "SSF_ICONSONLY": 16777216,
    "SSF_SHOWTYPEOVERLAY": 33554432,
    "SSF_SHOWSTATUSBAR": 67108864
  },
  "DROPEFFECT": {
    "DROPEFFECT_NONE": 0,
    "DROPEFFECT_COPY": 1,
    "DROPEFFECT_MOVE": 2,
    "DROPEFFECT_LINK": 4,
    "DROPEFFECT_SCROLL": 2147483648
  },
  "NOTIFY_ICON_MESSAGE": {
    "NIM_ADD": 0,
    "NIM_MODIFY": 1,
    "NIM_DELETE": 2,
    "NIM_SETFOCUS": 3,
    "NIM_SETVERSION": 4
  },
  "GPFIDL_FLAGS": {
    "GPFIDL_DEFAULT": 0,
    "GPFIDL_ALTNAME": 1,
    "GPFIDL_UNCPRINTER": 2
  },
  "SHGSI_FLAGS": {
    "SHGSI_ICONLOCATION": 0,
    "SHGSI_ICON": 256,
    "SHGSI_SYSICONINDEX": 16384,
    "SHGSI_LINKOVERLAY": 32768,
    "SHGSI_SELECTED": 65536,
    "SHGSI_LARGEICON": 0,
    "SHGSI_SMALLICON": 1,
    "SHGSI_SHELLICONSIZE": 4
  },
  "SHOW_WINDOW_CMD": {
    "SW_HIDE": 0,
    "SW_SHOWNORMAL": 1,
    "SW_NORMAL": 1,
    "SW_SHOWMINIMIZED": 2,
    "SW_SHOWMAXIMIZED": 3,
    "SW_MAXIMIZE": 3,
    "SW_SHOWNOACTIVATE": 4,
    "SW_SHOW": 5,
    "SW_MINIMIZE": 6,
    "SW_SHOWMINNOACTIVE": 7,
    "SW_SHOWNA": 8,
    "SW_RESTORE": 9,
    "SW_SHOWDEFAULT": 10,
    "SW_FORCEMINIMIZE": 11,
    "SW_MAX": 11
  },
  "GETPROPERTYSTOREFLAGS": {
    "GPS_DEFAULT": 0,
    "GPS_HANDLERPROPERTIESONLY": 1,
    "GPS_READWRITE": 2,
    "GPS_TEMPORARY": 4,
    "GPS_FASTPROPERTIESONLY": 8,
    "GPS_OPENSLOWITEM": 16,
    "GPS_DELAYCREATION": 32,
    "GPS_BESTEFFORT": 64,
    "GPS_NO_OPLOCK": 128,
    "GPS_PREFERQUERYPROPERTIES": 256,
    "GPS_EXTRINSICPROPERTIES": 512,
    "GPS_EXTRINSICPROPERTIESONLY": 1024,
    "GPS_VOLATILEPROPERTIES": 2048,
    "GPS_VOLATILEPROPERTIESONLY": 4096,
    "GPS_MASK_VALID": 8191
  },
  "SIGDN": {
    "SIGDN_NORMALDISPLAY": 0,
    "SIGDN_PARENTRELATIVEPARSING": -2147385343,
    "SIGDN_DESKTOPABSOLUTEPARSING": -2147319808,
    "SIGDN_PARENTRELATIVEEDITING": -2147282943,
    "SIGDN_DESKTOPABSOLUTEEDITING": -2147172352,
    "SIGDN_FILESYSPATH": -2147123200,
    "SIGDN_URL": -2147057664,
    "SIGDN_PARENTRELATIVEFORADDRESSBAR": -2146975743,
    "SIGDN_PARENTRELATIVE": -2146959359,
    "SIGDN_PARENTRELATIVEFORUI": -2146877439
  },
  "DATAOBJ_GET_ITEM_FLAGS": {
    "DOGIF_DEFAULT": 0,
    "DOGIF_TRAVERSE_LINK": 1,
    "DOGIF_NO_HDROP": 2,
    "DOGIF_NO_URL": 4,
    "DOGIF_ONLY_IF_ONE": 8
  },
  "LIBRARYMANAGEDIALOGOPTIONS": {
    "LMD_DEFAULT": 0,
    "LMD_ALLOWUNINDEXABLENETWORKLOCATIONS": 1
  },
  "ASSOC_FILTER": {
    "ASSOC_FILTER_NONE": 0,
    "ASSOC_FILTER_RECOMMENDED": 1
  },
  "KNOWN_FOLDER_FLAG": {
    "KF_FLAG_DEFAULT": 0,
    "KF_FLAG_FORCE_APP_DATA_REDIRECTION": 524288,
    "KF_FLAG_RETURN_FILTER_REDIRECTION_TARGET": 262144,
    "KF_FLAG_FORCE_PACKAGE_REDIRECTION": 131072,
    "KF_FLAG_NO_PACKAGE_REDIRECTION": 65536,
    "KF_FLAG_FORCE_APPCONTAINER_REDIRECTION": 131072,
    "KF_FLAG_NO_APPCONTAINER_REDIRECTION": 65536,
    "KF_FLAG_CREATE": 32768,
    "KF_FLAG_DONT_VERIFY": 16384,
    "KF_FLAG_DONT_UNEXPAND": 8192,
    "KF_FLAG_NO_ALIAS": 4096,
    "KF_FLAG_INIT": 2048,
    "KF_FLAG_DEFAULT_PATH": 1024,
    "KF_FLAG_NOT_PARENT_RELATIVE": 512,
    "KF_FLAG_SIMPLE_IDLIST": 256,
    "KF_FLAG_ALIAS_ONLY": -2147483648
  },
  "SCNRT_STATUS": {
    "SCNRT_ENABLE": 0,
    "SCNRT_DISABLE": 1
  },
  "RESTRICTIONS": {
    "REST_NONE": 0,
    "REST_NORUN": 1,
    "REST_NOCLOSE": 2,
    "REST_NOSAVESET": 4,
    "REST_NOFILEMENU": 8,
    "REST_NOSETFOLDERS": 16,
    "REST_NOSETTASKBAR": 32,
    "REST_NODESKTOP": 64,
    "REST_NOFIND": 128,
    "REST_NODRIVES": 256,
    "REST_NODRIVEAUTORUN": 512,
    "REST_NODRIVETYPEAUTORUN": 1024,
    "REST_NONETHOOD": 2048,
    "REST_STARTBANNER": 4096,
    "REST_RESTRICTRUN": 8192,
    "REST_NOPRINTERTABS": 16384,
    "REST_NOPRINTERDELETE": 32768,
    "REST_NOPRINTERADD": 65536,
    "REST_NOSTARTMENUSUBFOLDERS": 131072,
    "REST_MYDOCSONNET": 262144,
    "REST_NOEXITTODOS": 524288,
    "REST_ENFORCESHELLEXTSECURITY": 1048576,
    "REST_LINKRESOLVEIGNORELINKINFO": 2097152,
    "REST_NOCOMMONGROUPS": 4194304,
    "REST_SEPARATEDESKTOPPROCESS": 8388608,
    "REST_NOWEB": 16777216,
    "REST_NOTRAYCONTEXTMENU": 33554432,
    "REST_NOVIEWCONTEXTMENU": 67108864,
    "REST_NONETCONNECTDISCONNECT": 134217728,
    "REST_STARTMENULOGOFF": 268435456,
    "REST_NOSETTINGSASSIST": 536870912,
    "REST_NOINTERNETICON": 1073741825,
    "REST_NORECENTDOCSHISTORY": 1073741826,
    "REST_NORECENTDOCSMENU": 1073741827,
    "REST_NOACTIVEDESKTOP": 1073741828,
    "REST_NOACTIVEDESKTOPCHANGES": 1073741829,
    "REST_NOFAVORITESMENU": 1073741830,
    "REST_CLEARRECENTDOCSONEXIT": 1073741831,
    "REST_CLASSICSHELL": 1073741832,
    "REST_NOCUSTOMIZEWEBVIEW": 1073741833,
    "REST_NOHTMLWALLPAPER": 1073741840,
    "REST_NOCHANGINGWALLPAPER": 1073741841,
    "REST_NODESKCOMP": 1073741842,
    "REST_NOADDDESKCOMP": 1073741843,
    "REST_NODELDESKCOMP": 1073741844,
    "REST_NOCLOSEDESKCOMP": 1073741845,
    "REST_NOCLOSE_DRAGDROPBAND": 1073741846,
    "REST_NOMOVINGBAND": 1073741847,
    "REST_NOEDITDESKCOMP": 1073741848,
    "REST_NORESOLVESEARCH": 1073741849,
    "REST_NORESOLVETRACK": 1073741850,
    "REST_FORCECOPYACLWITHFILE": 1073741851,
    "REST_NOFORGETSOFTWAREUPDATE": 1073741853,
    "REST_NOSETACTIVEDESKTOP": 1073741854,
    "REST_NOUPDATEWINDOWS": 1073741855,
    "REST_NOCHANGESTARMENU": 1073741856,
    "REST_NOFOLDEROPTIONS": 1073741857,
    "REST_HASFINDCOMPUTERS": 1073741858,
    "REST_INTELLIMENUS": 1073741859,
    "REST_RUNDLGMEMCHECKBOX": 1073741860,
    "REST_ARP_ShowPostSetup": 1073741861,
    "REST_NOCSC": 1073741862,
    "REST_NOCONTROLPANEL": 1073741863,
    "REST_ENUMWORKGROUP": 1073741864,
    "REST_ARP_NOARP": 1073741865,
    "REST_ARP_NOREMOVEPAGE": 1073741866,
    "REST_ARP_NOADDPAGE": 1073741867,
    "REST_ARP_NOWINSETUPPAGE": 1073741868,
    "REST_GREYMSIADS": 1073741869,
    "REST_NOCHANGEMAPPEDDRIVELABEL": 1073741870,
    "REST_NOCHANGEMAPPEDDRIVECOMMENT": 1073741871,
    "REST_MaxRecentDocs": 1073741872,
    "REST_NONETWORKCONNECTIONS": 1073741873,
    "REST_FORCESTARTMENULOGOFF": 1073741874,
    "REST_NOWEBVIEW": 1073741875,
    "REST_NOCUSTOMIZETHISFOLDER": 1073741876,
    "REST_NOENCRYPTION": 1073741877,
    "REST_DONTSHOWSUPERHIDDEN": 1073741879,
    "REST_NOSHELLSEARCHBUTTON": 1073741880,
    "REST_NOHARDWARETAB": 1073741881,
    "REST_NORUNASINSTALLPROMPT": 1073741882,
    "REST_PROMPTRUNASINSTALLNETPATH": 1073741883,
    "REST_NOMANAGEMYCOMPUTERVERB": 1073741884,
    "REST_DISALLOWRUN": 1073741886,
    "REST_NOWELCOMESCREEN": 1073741887,
    "REST_RESTRICTCPL": 1073741888,
    "REST_DISALLOWCPL": 1073741889,
    "REST_NOSMBALLOONTIP": 1073741890,
    "REST_NOSMHELP": 1073741891,
    "REST_NOWINKEYS": 1073741892,
    "REST_NOENCRYPTONMOVE": 1073741893,
    "REST_NOLOCALMACHINERUN": 1073741894,
    "REST_NOCURRENTUSERRUN": 1073741895,
    "REST_NOLOCALMACHINERUNONCE": 1073741896,
    "REST_NOCURRENTUSERRUNONCE": 1073741897,
    "REST_FORCEACTIVEDESKTOPON": 1073741898,
    "REST_NOVIEWONDRIVE": 1073741900,
    "REST_NONETCRAWL": 1073741901,
    "REST_NOSHAREDDOCUMENTS": 1073741902,
    "REST_NOSMMYDOCS": 1073741903,
    "REST_NOSMMYPICS": 1073741904,
    "REST_ALLOWBITBUCKDRIVES": 1073741905,
    "REST_NONLEGACYSHELLMODE": 1073741906,
    "REST_NOCONTROLPANELBARRICADE": 1073741907,
    "REST_NOSTARTPAGE": 1073741908,
    "REST_NOAUTOTRAYNOTIFY": 1073741909,
    "REST_NOTASKGROUPING": 1073741910,
    "REST_NOCDBURNING": 1073741911,
    "REST_MYCOMPNOPROP": 1073741912,
    "REST_MYDOCSNOPROP": 1073741913,
    "REST_NOSTARTPANEL": 1073741914,
    "REST_NODISPLAYAPPEARANCEPAGE": 1073741915,
    "REST_NOTHEMESTAB": 1073741916,
    "REST_NOVISUALSTYLECHOICE": 1073741917,
    "REST_NOSIZECHOICE": 1073741918,
    "REST_NOCOLORCHOICE": 1073741919,
    "REST_SETVISUALSTYLE": 1073741920,
    "REST_STARTRUNNOHOMEPATH": 1073741921,
    "REST_NOUSERNAMEINSTARTPANEL": 1073741922,
    "REST_NOMYCOMPUTERICON": 1073741923,
    "REST_NOSMNETWORKPLACES": 1073741924,
    "REST_NOSMPINNEDLIST": 1073741925,
    "REST_NOSMMYMUSIC": 1073741926,
    "REST_NOSMEJECTPC": 1073741927,
    "REST_NOSMMOREPROGRAMS": 1073741928,
    "REST_NOSMMFUPROGRAMS": 1073741929,
    "REST_NOTRAYITEMSDISPLAY": 1073741930,
    "REST_NOTOOLBARSONTASKBAR": 1073741931,
    "REST_NOSMCONFIGUREPROGRAMS": 1073741935,
    "REST_HIDECLOCK": 1073741936,
    "REST_NOLOWDISKSPACECHECKS": 1073741937,
    "REST_NOENTIRENETWORK": 1073741938,
    "REST_NODESKTOPCLEANUP": 1073741939,
    "REST_BITBUCKNUKEONDELETE": 1073741940,
    "REST_BITBUCKCONFIRMDELETE": 1073741941,
    "REST_BITBUCKNOPROP": 1073741942,
    "REST_NODISPBACKGROUND": 1073741943,
    "REST_NODISPSCREENSAVEPG": 1073741944,
    "REST_NODISPSETTINGSPG": 1073741945,
    "REST_NODISPSCREENSAVEPREVIEW": 1073741946,
    "REST_NODISPLAYCPL": 1073741947,
    "REST_HIDERUNASVERB": 1073741948,
    "REST_NOTHUMBNAILCACHE": 1073741949,
    "REST_NOSTRCMPLOGICAL": 1073741950,
    "REST_NOPUBLISHWIZARD": 1073741951,
    "REST_NOONLINEPRINTSWIZARD": 1073741952,
    "REST_NOWEBSERVICES": 1073741953,
    "REST_ALLOWUNHASHEDWEBVIEW": 1073741954,
    "REST_ALLOWLEGACYWEBVIEW": 1073741955,
    "REST_REVERTWEBVIEWSECURITY": 1073741956,
    "REST_INHERITCONSOLEHANDLES": 1073741958,
    "REST_NOREMOTERECURSIVEEVENTS": 1073741961,
    "REST_NOREMOTECHANGENOTIFY": 1073741969,
    "REST_NOENUMENTIRENETWORK": 1073741971,
    "REST_NOINTERNETOPENWITH": 1073741973,
    "REST_DONTRETRYBADNETNAME": 1073741979,
    "REST_ALLOWFILECLSIDJUNCTIONS": 1073741980,
    "REST_NOUPNPINSTALL": 1073741981,
    "REST_ARP_DONTGROUPPATCHES": 1073741996,
    "REST_ARP_NOCHOOSEPROGRAMSPAGE": 1073741997,
    "REST_NODISCONNECT": 1090519041,
    "REST_NOSECURITY": 1090519042,
    "REST_NOFILEASSOCIATE": 1090519043,
    "REST_ALLOWCOMMENTTOGGLE": 1090519044
  },
  "QUERY_USER_NOTIFICATION_STATE": {
    "QUNS_NOT_PRESENT": 1,
    "QUNS_BUSY": 2,
    "QUNS_RUNNING_D3D_FULL_SCREEN": 3,
    "QUNS_PRESENTATION_MODE": 4,
    "QUNS_ACCEPTS_NOTIFICATIONS": 5,
    "QUNS_QUIET_TIME": 6,
    "QUNS_APP": 7
  },
  "SHSTOCKICONID": {
    "SIID_DOCNOASSOC": 0,
    "SIID_DOCASSOC": 1,
    "SIID_APPLICATION": 2,
    "SIID_FOLDER": 3,
    "SIID_FOLDEROPEN": 4,
    "SIID_DRIVE525": 5,
    "SIID_DRIVE35": 6,
    "SIID_DRIVEREMOVE": 7,
    "SIID_DRIVEFIXED": 8,
    "SIID_DRIVENET": 9,
    "SIID_DRIVENETDISABLED": 10,
    "SIID_DRIVECD": 11,
    "SIID_DRIVERAM": 12,
    "SIID_WORLD": 13,
    "SIID_SERVER": 15,
    "SIID_PRINTER": 16,
    "SIID_MYNETWORK": 17,
    "SIID_FIND": 22,
    "SIID_HELP": 23,
    "SIID_SHARE": 28,
    "SIID_LINK": 29,
    "SIID_SLOWFILE": 30,
    "SIID_RECYCLER": 31,
    "SIID_RECYCLERFULL": 32,
    "SIID_MEDIACDAUDIO": 40,
    "SIID_LOCK": 47,
    "SIID_AUTOLIST": 49,
    "SIID_PRINTERNET": 50,
    "SIID_SERVERSHARE": 51,
    "SIID_PRINTERFAX": 52,
    "SIID_PRINTERFAXNET": 53,
    "SIID_PRINTERFILE": 54,
    "SIID_STACK": 55,
    "SIID_MEDIASVCD": 56,
    "SIID_STUFFEDFOLDER": 57,
    "SIID_DRIVEUNKNOWN": 58,
    "SIID_DRIVEDVD": 59,
    "SIID_MEDIADVD": 60,
    "SIID_MEDIADVDRAM": 61,
    "SIID_MEDIADVDRW": 62,
    "SIID_MEDIADVDR": 63,
    "SIID_MEDIADVDROM": 64,
    "SIID_MEDIACDAUDIOPLUS": 65,
    "SIID_MEDIACDRW": 66,
    "SIID_MEDIACDR": 67,
    "SIID_MEDIACDBURN": 68,
    "SIID_MEDIABLANKCD": 69,
    "SIID_MEDIACDROM": 70,
    "SIID_AUDIOFILES": 71,
    "SIID_IMAGEFILES": 72,
    "SIID_VIDEOFILES": 73,
    "SIID_MIXEDFILES": 74,
    "SIID_FOLDERBACK": 75,
    "SIID_FOLDERFRONT": 76,
    "SIID_SHIELD": 77,
    "SIID_WARNING": 78,
    "SIID_INFO": 79,
    "SIID_ERROR": 80,
    "SIID_KEY": 81,
    "SIID_SOFTWARE": 82,
    "SIID_RENAME": 83,
    "SIID_DELETE": 84,
    "SIID_MEDIAAUDIODVD": 85,
    "SIID_MEDIAMOVIEDVD": 86,
    "SIID_MEDIAENHANCEDCD": 87,
    "SIID_MEDIAENHANCEDDVD": 88,
    "SIID_MEDIAHDDVD": 89,
    "SIID_MEDIABLURAY": 90,
    "SIID_MEDIAVCD": 91,
    "SIID_MEDIADVDPLUSR": 92,
    "SIID_MEDIADVDPLUSRW": 93,
    "SIID_DESKTOPPC": 94,
    "SIID_MOBILEPC": 95,
    "SIID_USERS": 96,
    "SIID_MEDIASMARTMEDIA": 97,
    "SIID_MEDIACOMPACTFLASH": 98,
    "SIID_DEVICECELLPHONE": 99,
    "SIID_DEVICECAMERA": 100,
    "SIID_DEVICEVIDEOCAMERA": 101,
    "SIID_DEVICEAUDIOPLAYER": 102,
    "SIID_NETWORKCONNECT": 103,
    "SIID_INTERNET": 104,
    "SIID_ZIPFILE": 105,
    "SIID_SETTINGS": 106,
    "SIID_DRIVEHDDVD": 132,
    "SIID_DRIVEBD": 133,
    "SIID_MEDIAHDDVDROM": 134,
    "SIID_MEDIAHDDVDR": 135,
    "SIID_MEDIAHDDVDRAM": 136,
    "SIID_MEDIABDROM": 137,
    "SIID_MEDIABDR": 138,
    "SIID_MEDIABDRE": 139,
    "SIID_CLUSTEREDDRIVE": 140,
    "SIID_MAX_ICONS": 181
  }
} as const;
export const wideAliases = {
  "SHGetIconOverlayIndex": "SHGetIconOverlayIndexW",
  "ILCreateFromPath": "ILCreateFromPathW",
  "SHGetPathFromIDList": "SHGetPathFromIDListW",
  "SHCreateDirectoryEx": "SHCreateDirectoryExW",
  "SHGetSpecialFolderPath": "SHGetSpecialFolderPathW",
  "SHGetFolderPath": "SHGetFolderPathW",
  "SHSetFolderPath": "SHSetFolderPathW",
  "SHGetFolderPathAndSubDir": "SHGetFolderPathAndSubDirW",
  "SHBrowseForFolder": "SHBrowseForFolderW",
  "SHUpdateImage": "SHUpdateImageW",
  "SHGetDataFromIDList": "SHGetDataFromIDListW",
  "SHDefExtractIcon": "SHDefExtractIconW",
  "Shell_GetCachedImageIndex": "Shell_GetCachedImageIndexW",
  "SHPathPrepareForWrite": "SHPathPrepareForWriteW",
  "PathIsSlow": "PathIsSlowW",
  "DragQueryFile": "DragQueryFileW",
  "ShellExecute": "ShellExecuteW",
  "FindExecutable": "FindExecutableW",
  "ShellAbout": "ShellAboutW",
  "ExtractAssociatedIcon": "ExtractAssociatedIconW",
  "ExtractAssociatedIconEx": "ExtractAssociatedIconExW",
  "ExtractIcon": "ExtractIconW",
  "DoEnvironmentSubst": "DoEnvironmentSubstW",
  "ExtractIconEx": "ExtractIconExW",
  "SHFileOperation": "SHFileOperationW",
  "ShellExecuteEx": "ShellExecuteExW",
  "SHQueryRecycleBin": "SHQueryRecycleBinW",
  "SHEmptyRecycleBin": "SHEmptyRecycleBinW",
  "Shell_NotifyIcon": "Shell_NotifyIconW",
  "SHGetFileInfo": "SHGetFileInfoW",
  "SHGetDiskFreeSpaceEx": "SHGetDiskFreeSpaceExW",
  "SHGetNewLinkInfo": "SHGetNewLinkInfoW",
  "SHInvokePrinterCommand": "SHInvokePrinterCommandW",
  "IsLFNDrive": "IsLFNDriveW"
} as const;
export const signatures = {
  "shell32.dll": {
    "#660": {
      "args": [
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SHSimpleIDListFromPath": {
      "args": [
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.UI.Shell.Common.ITEMIDLIST*",
      "setLastError": false
    },
    "SHCreateItemFromIDList": {
      "args": [
        "Windows.Win32.UI.Shell.Common.ITEMIDLIST*",
        "System.Guid*",
        "void**"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "SHCreateItemFromParsingName": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.System.Com.IBindCtx",
        "System.Guid*",
        "void**"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "SHCreateItemWithParent": {
      "args": [
        "Windows.Win32.UI.Shell.Common.ITEMIDLIST*",
        "Windows.Win32.UI.Shell.IShellFolder",
        "Windows.Win32.UI.Shell.Common.ITEMIDLIST*",
        "System.Guid*",
        "void**"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "SHCreateItemFromRelativeName": {
      "args": [
        "Windows.Win32.UI.Shell.IShellItem",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.System.Com.IBindCtx",
        "System.Guid*",
        "void**"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "SHCreateItemInKnownFolder": {
      "args": [
        "System.Guid*",
        "u32",
        "Windows.Win32.Foundation.PWSTR",
        "System.Guid*",
        "void**"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "SHGetIDListFromObject": {
      "args": [
        "Windows.Win32.System.Com.IUnknown",
        "Windows.Win32.UI.Shell.Common.ITEMIDLIST**"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "SHGetItemFromObject": {
      "args": [
        "Windows.Win32.System.Com.IUnknown",
        "System.Guid*",
        "void**"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "SHGetNameFromIDList": {
      "args": [
        "Windows.Win32.UI.Shell.Common.ITEMIDLIST*",
        "Windows.Win32.UI.Shell.SIGDN",
        "Windows.Win32.Foundation.PWSTR*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "SHGetItemFromDataObject": {
      "args": [
        "Windows.Win32.System.Com.IDataObject",
        "Windows.Win32.UI.Shell.DATAOBJ_GET_ITEM_FLAGS",
        "System.Guid*",
        "void**"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "SHCreateShellItemArray": {
      "args": [
        "Windows.Win32.UI.Shell.Common.ITEMIDLIST*",
        "Windows.Win32.UI.Shell.IShellFolder",
        "u32",
        "Windows.Win32.UI.Shell.Common.ITEMIDLIST**",
        "Windows.Win32.UI.Shell.IShellItemArray*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "SHCreateShellItemArrayFromDataObject": {
      "args": [
        "Windows.Win32.System.Com.IDataObject",
        "System.Guid*",
        "void**"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "SHCreateShellItemArrayFromIDLists": {
      "args": [
        "u32",
        "Windows.Win32.UI.Shell.Common.ITEMIDLIST**",
        "Windows.Win32.UI.Shell.IShellItemArray*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "SHCreateShellItemArrayFromShellItem": {
      "args": [
        "Windows.Win32.UI.Shell.IShellItem",
        "System.Guid*",
        "void**"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "SHCreateAssociationRegistration": {
      "args": [
        "System.Guid*",
        "void**"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "SHCreateDefaultExtractIcon": {
      "args": [
        "System.Guid*",
        "void**"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "SetCurrentProcessExplicitAppUserModelID": {
      "args": [
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "GetCurrentProcessExplicitAppUserModelID": {
      "args": [
        "Windows.Win32.Foundation.PWSTR*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "SHGetTemporaryPropertyForItem": {
      "args": [
        "Windows.Win32.UI.Shell.IShellItem",
        "Windows.Win32.Foundation.PROPERTYKEY*",
        "Windows.Win32.System.Com.StructuredStorage.PROPVARIANT*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "SHSetTemporaryPropertyForItem": {
      "args": [
        "Windows.Win32.UI.Shell.IShellItem",
        "Windows.Win32.Foundation.PROPERTYKEY*",
        "Windows.Win32.System.Com.StructuredStorage.PROPVARIANT*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "SHShowManageLibraryUI": {
      "args": [
        "Windows.Win32.UI.Shell.IShellItem",
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.UI.Shell.LIBRARYMANAGEDIALOGOPTIONS"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "SHResolveLibrary": {
      "args": [
        "Windows.Win32.UI.Shell.IShellItem"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "SHAssocEnumHandlers": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.UI.Shell.ASSOC_FILTER",
        "Windows.Win32.UI.Shell.IEnumAssocHandlers*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "SHAssocEnumHandlersForProtocolByApplication": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "System.Guid*",
        "void**"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "SHCreateDefaultPropertiesOp": {
      "args": [
        "Windows.Win32.UI.Shell.IShellItem",
        "Windows.Win32.UI.Shell.IFileOperation*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "SHSetDefaultProperties": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.UI.Shell.IShellItem",
        "u32",
        "Windows.Win32.UI.Shell.IFileOperationProgressSink"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "SHGetMalloc": {
      "args": [
        "Windows.Win32.System.Com.IMalloc*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "SHAlloc": {
      "args": [
        "usize"
      ],
      "returns": "void*",
      "setLastError": false
    },
    "SHFree": {
      "args": [
        "void*"
      ],
      "returns": "void",
      "setLastError": false
    },
    "SHGetIconOverlayIndexA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "i32"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "SHGetIconOverlayIndexW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "i32"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "ILClone": {
      "args": [
        "Windows.Win32.UI.Shell.Common.ITEMIDLIST*"
      ],
      "returns": "Windows.Win32.UI.Shell.Common.ITEMIDLIST*",
      "setLastError": false
    },
    "ILCloneFirst": {
      "args": [
        "Windows.Win32.UI.Shell.Common.ITEMIDLIST*"
      ],
      "returns": "Windows.Win32.UI.Shell.Common.ITEMIDLIST*",
      "setLastError": false
    },
    "ILCombine": {
      "args": [
        "Windows.Win32.UI.Shell.Common.ITEMIDLIST*",
        "Windows.Win32.UI.Shell.Common.ITEMIDLIST*"
      ],
      "returns": "Windows.Win32.UI.Shell.Common.ITEMIDLIST*",
      "setLastError": false
    },
    "ILFree": {
      "args": [
        "Windows.Win32.UI.Shell.Common.ITEMIDLIST*"
      ],
      "returns": "void",
      "setLastError": false
    },
    "ILGetNext": {
      "args": [
        "Windows.Win32.UI.Shell.Common.ITEMIDLIST*"
      ],
      "returns": "Windows.Win32.UI.Shell.Common.ITEMIDLIST*",
      "setLastError": false
    },
    "ILGetSize": {
      "args": [
        "Windows.Win32.UI.Shell.Common.ITEMIDLIST*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "ILFindChild": {
      "args": [
        "Windows.Win32.UI.Shell.Common.ITEMIDLIST*",
        "Windows.Win32.UI.Shell.Common.ITEMIDLIST*"
      ],
      "returns": "Windows.Win32.UI.Shell.Common.ITEMIDLIST*",
      "setLastError": false
    },
    "ILFindLastID": {
      "args": [
        "Windows.Win32.UI.Shell.Common.ITEMIDLIST*"
      ],
      "returns": "Windows.Win32.UI.Shell.Common.ITEMIDLIST*",
      "setLastError": false
    },
    "ILRemoveLastID": {
      "args": [
        "Windows.Win32.UI.Shell.Common.ITEMIDLIST*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ILIsEqual": {
      "args": [
        "Windows.Win32.UI.Shell.Common.ITEMIDLIST*",
        "Windows.Win32.UI.Shell.Common.ITEMIDLIST*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ILIsParent": {
      "args": [
        "Windows.Win32.UI.Shell.Common.ITEMIDLIST*",
        "Windows.Win32.UI.Shell.Common.ITEMIDLIST*",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ILSaveToStream": {
      "args": [
        "Windows.Win32.System.Com.IStream",
        "Windows.Win32.UI.Shell.Common.ITEMIDLIST*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "ILLoadFromStreamEx": {
      "args": [
        "Windows.Win32.System.Com.IStream",
        "Windows.Win32.UI.Shell.Common.ITEMIDLIST**"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "ILCreateFromPathA": {
      "args": [
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.UI.Shell.Common.ITEMIDLIST*",
      "setLastError": false
    },
    "ILCreateFromPathW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.UI.Shell.Common.ITEMIDLIST*",
      "setLastError": false
    },
    "SHILCreateFromPath": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.UI.Shell.Common.ITEMIDLIST**",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "ILAppendID": {
      "args": [
        "Windows.Win32.UI.Shell.Common.ITEMIDLIST*",
        "Windows.Win32.UI.Shell.Common.SHITEMID*",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "Windows.Win32.UI.Shell.Common.ITEMIDLIST*",
      "setLastError": false
    },
    "SHGetPathFromIDListEx": {
      "args": [
        "Windows.Win32.UI.Shell.Common.ITEMIDLIST*",
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "Windows.Win32.UI.Shell.GPFIDL_FLAGS"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SHGetPathFromIDListA": {
      "args": [
        "Windows.Win32.UI.Shell.Common.ITEMIDLIST*",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SHGetPathFromIDListW": {
      "args": [
        "Windows.Win32.UI.Shell.Common.ITEMIDLIST*",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SHCreateDirectory": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "SHCreateDirectoryExA": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Security.SECURITY_ATTRIBUTES*"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "SHCreateDirectoryExW": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Security.SECURITY_ATTRIBUTES*"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "SHOpenFolderAndSelectItems": {
      "args": [
        "Windows.Win32.UI.Shell.Common.ITEMIDLIST*",
        "u32",
        "Windows.Win32.UI.Shell.Common.ITEMIDLIST**",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "SHCreateShellItem": {
      "args": [
        "Windows.Win32.UI.Shell.Common.ITEMIDLIST*",
        "Windows.Win32.UI.Shell.IShellFolder",
        "Windows.Win32.UI.Shell.Common.ITEMIDLIST*",
        "Windows.Win32.UI.Shell.IShellItem*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "SHGetSpecialFolderLocation": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "i32",
        "Windows.Win32.UI.Shell.Common.ITEMIDLIST**"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "SHCloneSpecialIDList": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "i32",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "Windows.Win32.UI.Shell.Common.ITEMIDLIST*",
      "setLastError": false
    },
    "SHGetSpecialFolderPathA": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.PSTR",
        "i32",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SHGetSpecialFolderPathW": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.PWSTR",
        "i32",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SHFlushSFCache": {
      "args": [],
      "returns": "void",
      "setLastError": false
    },
    "SHGetFolderPathA": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "i32",
        "Windows.Win32.Foundation.HANDLE",
        "u32",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "SHGetFolderPathW": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "i32",
        "Windows.Win32.Foundation.HANDLE",
        "u32",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "SHGetFolderLocation": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "i32",
        "Windows.Win32.Foundation.HANDLE",
        "u32",
        "Windows.Win32.UI.Shell.Common.ITEMIDLIST**"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "SHSetFolderPathA": {
      "args": [
        "i32",
        "Windows.Win32.Foundation.HANDLE",
        "u32",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "SHSetFolderPathW": {
      "args": [
        "i32",
        "Windows.Win32.Foundation.HANDLE",
        "u32",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "SHGetFolderPathAndSubDirA": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "i32",
        "Windows.Win32.Foundation.HANDLE",
        "u32",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "SHGetFolderPathAndSubDirW": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "i32",
        "Windows.Win32.Foundation.HANDLE",
        "u32",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "SHGetKnownFolderIDList": {
      "args": [
        "System.Guid*",
        "u32",
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.UI.Shell.Common.ITEMIDLIST**"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "SHSetKnownFolderPath": {
      "args": [
        "System.Guid*",
        "u32",
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "SHGetKnownFolderPath": {
      "args": [
        "System.Guid*",
        "u32",
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Foundation.PWSTR*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "SHGetKnownFolderItem": {
      "args": [
        "System.Guid*",
        "Windows.Win32.UI.Shell.KNOWN_FOLDER_FLAG",
        "Windows.Win32.Foundation.HANDLE",
        "System.Guid*",
        "void**"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "SHGetSetFolderCustomSettings": {
      "args": [
        "Windows.Win32.UI.Shell.SHFOLDERCUSTOMSETTINGS*",
        "Windows.Win32.Foundation.PWSTR",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "SHBrowseForFolderA": {
      "args": [
        "Windows.Win32.UI.Shell.BROWSEINFOA*"
      ],
      "returns": "Windows.Win32.UI.Shell.Common.ITEMIDLIST*",
      "setLastError": false
    },
    "SHBrowseForFolderW": {
      "args": [
        "Windows.Win32.UI.Shell.BROWSEINFOW*"
      ],
      "returns": "Windows.Win32.UI.Shell.Common.ITEMIDLIST*",
      "setLastError": false
    },
    "SHLoadInProc": {
      "args": [
        "System.Guid*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "SHGetDesktopFolder": {
      "args": [
        "Windows.Win32.UI.Shell.IShellFolder*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "SHChangeNotify": {
      "args": [
        "i32",
        "Windows.Win32.UI.Shell.SHCNF_FLAGS",
        "void*",
        "void*"
      ],
      "returns": "void",
      "setLastError": false
    },
    "SHAddToRecentDocs": {
      "args": [
        "u32",
        "void*"
      ],
      "returns": "void",
      "setLastError": false
    },
    "SHHandleUpdateImage": {
      "args": [
        "Windows.Win32.UI.Shell.Common.ITEMIDLIST*"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "SHUpdateImageA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "i32",
        "u32",
        "i32"
      ],
      "returns": "void",
      "setLastError": false
    },
    "SHUpdateImageW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "i32",
        "u32",
        "i32"
      ],
      "returns": "void",
      "setLastError": false
    },
    "SHChangeNotifyRegister": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.UI.Shell.SHCNRF_SOURCE",
        "i32",
        "u32",
        "i32",
        "Windows.Win32.UI.Shell.SHChangeNotifyEntry*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "SHChangeNotifyDeregister": {
      "args": [
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SHChangeNotification_Lock": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "u32",
        "Windows.Win32.UI.Shell.Common.ITEMIDLIST***",
        "i32*"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "SHChangeNotification_Unlock": {
      "args": [
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SHGetRealIDL": {
      "args": [
        "Windows.Win32.UI.Shell.IShellFolder",
        "Windows.Win32.UI.Shell.Common.ITEMIDLIST*",
        "Windows.Win32.UI.Shell.Common.ITEMIDLIST**"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "SHGetInstanceExplorer": {
      "args": [
        "Windows.Win32.System.Com.IUnknown*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "SHGetDataFromIDListA": {
      "args": [
        "Windows.Win32.UI.Shell.IShellFolder",
        "Windows.Win32.UI.Shell.Common.ITEMIDLIST*",
        "Windows.Win32.UI.Shell.SHGDFIL_FORMAT",
        "void*",
        "i32"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "SHGetDataFromIDListW": {
      "args": [
        "Windows.Win32.UI.Shell.IShellFolder",
        "Windows.Win32.UI.Shell.Common.ITEMIDLIST*",
        "Windows.Win32.UI.Shell.SHGDFIL_FORMAT",
        "void*",
        "i32"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "RestartDialog": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.PWSTR",
        "u32"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "RestartDialogEx": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "u32"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "SHCoCreateInstance": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "System.Guid*",
        "Windows.Win32.System.Com.IUnknown",
        "System.Guid*",
        "void**"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "SHCreateDataObject": {
      "args": [
        "Windows.Win32.UI.Shell.Common.ITEMIDLIST*",
        "u32",
        "Windows.Win32.UI.Shell.Common.ITEMIDLIST**",
        "Windows.Win32.System.Com.IDataObject",
        "System.Guid*",
        "void**"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "CIDLData_CreateFromIDArray": {
      "args": [
        "Windows.Win32.UI.Shell.Common.ITEMIDLIST*",
        "u32",
        "Windows.Win32.UI.Shell.Common.ITEMIDLIST**",
        "Windows.Win32.System.Com.IDataObject*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "SHCreateStdEnumFmtEtc": {
      "args": [
        "u32",
        "Windows.Win32.System.Com.FORMATETC*",
        "Windows.Win32.System.Com.IEnumFORMATETC*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "SHDoDragDrop": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.System.Com.IDataObject",
        "Windows.Win32.System.Ole.IDropSource",
        "Windows.Win32.System.Ole.DROPEFFECT",
        "Windows.Win32.System.Ole.DROPEFFECT*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "DAD_SetDragImage": {
      "args": [
        "Windows.Win32.UI.Controls.HIMAGELIST",
        "Windows.Win32.Foundation.POINT*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "DAD_DragEnterEx": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.POINT"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "DAD_DragEnterEx2": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.POINT",
        "Windows.Win32.System.Com.IDataObject"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "DAD_ShowDragImage": {
      "args": [
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "DAD_DragMove": {
      "args": [
        "Windows.Win32.Foundation.POINT"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "DAD_DragLeave": {
      "args": [],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "DAD_AutoScroll": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.UI.Shell.AUTO_SCROLL_DATA*",
        "Windows.Win32.Foundation.POINT*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ReadCabinetState": {
      "args": [
        "Windows.Win32.UI.Shell.CABINETSTATE*",
        "i32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "WriteCabinetState": {
      "args": [
        "Windows.Win32.UI.Shell.CABINETSTATE*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "PathMakeUniqueName": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "PathIsExe": {
      "args": [
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "PathCleanupSpec": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "PathResolve": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "u16**",
        "u32"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "GetFileNameFromBrowse": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "DriveType": {
      "args": [
        "i32"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "RealDriveType": {
      "args": [
        "i32",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "IsNetDrive": {
      "args": [
        "i32"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "Shell_MergeMenus": {
      "args": [
        "Windows.Win32.UI.WindowsAndMessaging.HMENU",
        "Windows.Win32.UI.WindowsAndMessaging.HMENU",
        "u32",
        "u32",
        "u32",
        "Windows.Win32.UI.Shell.MM_FLAGS"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "SHObjectProperties": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "u32",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SHFormatDrive": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "u32",
        "Windows.Win32.UI.Shell.SHFMT_ID",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "SHDestroyPropSheetExtArray": {
      "args": [
        "Windows.Win32.UI.Shell.HPSXA"
      ],
      "returns": "void",
      "setLastError": false
    },
    "SHAddFromPropSheetExtArray": {
      "args": [
        "Windows.Win32.UI.Shell.HPSXA",
        "Windows.Win32.UI.Controls.LPFNSVADDPROPSHEETPAGE",
        "Windows.Win32.Foundation.LPARAM"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "SHReplaceFromPropSheetExtArray": {
      "args": [
        "Windows.Win32.UI.Shell.HPSXA",
        "u32",
        "Windows.Win32.UI.Controls.LPFNSVADDPROPSHEETPAGE",
        "Windows.Win32.Foundation.LPARAM"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "OpenRegStream": {
      "args": [
        "Windows.Win32.System.Registry.HKEY",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "u32"
      ],
      "returns": "Windows.Win32.System.Com.IStream",
      "setLastError": false
    },
    "SHFindFiles": {
      "args": [
        "Windows.Win32.UI.Shell.Common.ITEMIDLIST*",
        "Windows.Win32.UI.Shell.Common.ITEMIDLIST*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "PathGetShortPath": {
      "args": [
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "void",
      "setLastError": false
    },
    "PathYetAnotherMakeUniqueName": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "Win32DeleteFile": {
      "args": [
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SHRestricted": {
      "args": [
        "Windows.Win32.UI.Shell.RESTRICTIONS"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "SignalFileOpen": {
      "args": [
        "Windows.Win32.UI.Shell.Common.ITEMIDLIST*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "AssocGetDetailsOfPropKey": {
      "args": [
        "Windows.Win32.UI.Shell.IShellFolder",
        "Windows.Win32.UI.Shell.Common.ITEMIDLIST*",
        "Windows.Win32.Foundation.PROPERTYKEY*",
        "Windows.Win32.System.Variant.VARIANT*",
        "Windows.Win32.Foundation.BOOL*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "SHStartNetConnectionDialogW": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.PWSTR",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "SHDefExtractIconA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "i32",
        "u32",
        "Windows.Win32.UI.WindowsAndMessaging.HICON*",
        "Windows.Win32.UI.WindowsAndMessaging.HICON*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "SHDefExtractIconW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "i32",
        "u32",
        "Windows.Win32.UI.WindowsAndMessaging.HICON*",
        "Windows.Win32.UI.WindowsAndMessaging.HICON*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "SHOpenWithDialog": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.UI.Shell.OPENASINFO*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "Shell_GetImageLists": {
      "args": [
        "Windows.Win32.UI.Controls.HIMAGELIST*",
        "Windows.Win32.UI.Controls.HIMAGELIST*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "Shell_GetCachedImageIndex": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "i32",
        "u32"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "Shell_GetCachedImageIndexA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "i32",
        "u32"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "Shell_GetCachedImageIndexW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "i32",
        "u32"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "SHValidateUNC": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.PWSTR",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SHSetInstanceExplorer": {
      "args": [
        "Windows.Win32.System.Com.IUnknown"
      ],
      "returns": "void",
      "setLastError": false
    },
    "IsUserAnAdmin": {
      "args": [],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SHShellFolderView_Message": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "u32",
        "Windows.Win32.Foundation.LPARAM"
      ],
      "returns": "Windows.Win32.Foundation.LRESULT",
      "setLastError": false
    },
    "SHCreateShellFolderView": {
      "args": [
        "Windows.Win32.UI.Shell.SFV_CREATE*",
        "Windows.Win32.UI.Shell.IShellView*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "CDefFolderMenu_Create2": {
      "args": [
        "Windows.Win32.UI.Shell.Common.ITEMIDLIST*",
        "Windows.Win32.Foundation.HWND",
        "u32",
        "Windows.Win32.UI.Shell.Common.ITEMIDLIST**",
        "Windows.Win32.UI.Shell.IShellFolder",
        "Windows.Win32.UI.Shell.LPFNDFMCALLBACK",
        "u32",
        "Windows.Win32.System.Registry.HKEY*",
        "Windows.Win32.UI.Shell.IContextMenu*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "SHCreateDefaultContextMenu": {
      "args": [
        "Windows.Win32.UI.Shell.DEFCONTEXTMENU*",
        "System.Guid*",
        "void**"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "SHFind_InitMenuPopup": {
      "args": [
        "Windows.Win32.UI.WindowsAndMessaging.HMENU",
        "Windows.Win32.Foundation.HWND",
        "u32",
        "u32"
      ],
      "returns": "Windows.Win32.UI.Shell.IContextMenu",
      "setLastError": false
    },
    "SHCreateShellFolderViewEx": {
      "args": [
        "Windows.Win32.UI.Shell.CSFV*",
        "Windows.Win32.UI.Shell.IShellView*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "SHGetSetSettings": {
      "args": [
        "Windows.Win32.UI.Shell.SHELLSTATEA*",
        "Windows.Win32.UI.Shell.SSF_MASK",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "void",
      "setLastError": false
    },
    "SHGetSettings": {
      "args": [
        "Windows.Win32.UI.Shell.SHELLFLAGSTATE*",
        "u32"
      ],
      "returns": "void",
      "setLastError": false
    },
    "SHBindToParent": {
      "args": [
        "Windows.Win32.UI.Shell.Common.ITEMIDLIST*",
        "System.Guid*",
        "void**",
        "Windows.Win32.UI.Shell.Common.ITEMIDLIST**"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "SHBindToFolderIDListParent": {
      "args": [
        "Windows.Win32.UI.Shell.IShellFolder",
        "Windows.Win32.UI.Shell.Common.ITEMIDLIST*",
        "System.Guid*",
        "void**",
        "Windows.Win32.UI.Shell.Common.ITEMIDLIST**"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "SHBindToFolderIDListParentEx": {
      "args": [
        "Windows.Win32.UI.Shell.IShellFolder",
        "Windows.Win32.UI.Shell.Common.ITEMIDLIST*",
        "Windows.Win32.System.Com.IBindCtx",
        "System.Guid*",
        "void**",
        "Windows.Win32.UI.Shell.Common.ITEMIDLIST**"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "SHBindToObject": {
      "args": [
        "Windows.Win32.UI.Shell.IShellFolder",
        "Windows.Win32.UI.Shell.Common.ITEMIDLIST*",
        "Windows.Win32.System.Com.IBindCtx",
        "System.Guid*",
        "void**"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "SHParseDisplayName": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.System.Com.IBindCtx",
        "Windows.Win32.UI.Shell.Common.ITEMIDLIST**",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "SHPathPrepareForWriteA": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.System.Com.IUnknown",
        "Windows.Win32.Foundation.PSTR",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "SHPathPrepareForWriteW": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.System.Com.IUnknown",
        "Windows.Win32.Foundation.PWSTR",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "SHCreateFileExtractIconW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "System.Guid*",
        "void**"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "SHLimitInputEdit": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.UI.Shell.IShellFolder"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "SHGetAttributesFromDataObject": {
      "args": [
        "Windows.Win32.System.Com.IDataObject",
        "u32",
        "u32*",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "SHMapPIDLToSystemImageListIndex": {
      "args": [
        "Windows.Win32.UI.Shell.IShellFolder",
        "Windows.Win32.UI.Shell.Common.ITEMIDLIST*",
        "i32*"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "SHCLSIDFromString": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "System.Guid*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "PickIconDlg": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "i32*"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "StgMakeUniqueName": {
      "args": [
        "Windows.Win32.System.Com.StructuredStorage.IStorage",
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "System.Guid*",
        "void**"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "SHChangeNotifyRegisterThread": {
      "args": [
        "Windows.Win32.UI.Shell.SCNRT_STATUS"
      ],
      "returns": "void",
      "setLastError": false
    },
    "PathQualify": {
      "args": [
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "void",
      "setLastError": false
    },
    "PathIsSlowA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "PathIsSlowW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SHCreatePropSheetExtArray": {
      "args": [
        "Windows.Win32.System.Registry.HKEY",
        "Windows.Win32.Foundation.PWSTR",
        "u32"
      ],
      "returns": "Windows.Win32.UI.Shell.HPSXA",
      "setLastError": false
    },
    "SHOpenPropSheetW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.System.Registry.HKEY*",
        "u32",
        "System.Guid*",
        "Windows.Win32.System.Com.IDataObject",
        "Windows.Win32.UI.Shell.IShellBrowser",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SHMultiFileProperties": {
      "args": [
        "Windows.Win32.System.Com.IDataObject",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "SHCreateQueryCancelAutoPlayMoniker": {
      "args": [
        "Windows.Win32.System.Com.IMoniker*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "CommandLineToArgvW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "i32*"
      ],
      "returns": "Windows.Win32.Foundation.PWSTR*",
      "setLastError": false
    },
    "DragQueryFileA": {
      "args": [
        "Windows.Win32.UI.Shell.HDROP",
        "u32",
        "Windows.Win32.Foundation.PSTR",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "DragQueryFileW": {
      "args": [
        "Windows.Win32.UI.Shell.HDROP",
        "u32",
        "Windows.Win32.Foundation.PWSTR",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "DragQueryPoint": {
      "args": [
        "Windows.Win32.UI.Shell.HDROP",
        "Windows.Win32.Foundation.POINT*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "DragFinish": {
      "args": [
        "Windows.Win32.UI.Shell.HDROP"
      ],
      "returns": "void",
      "setLastError": false
    },
    "DragAcceptFiles": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "void",
      "setLastError": false
    },
    "ShellExecuteA": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.UI.WindowsAndMessaging.SHOW_WINDOW_CMD"
      ],
      "returns": "Windows.Win32.Foundation.HINSTANCE",
      "setLastError": false
    },
    "ShellExecuteW": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.UI.WindowsAndMessaging.SHOW_WINDOW_CMD"
      ],
      "returns": "Windows.Win32.Foundation.HINSTANCE",
      "setLastError": false
    },
    "FindExecutableA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.HINSTANCE",
      "setLastError": false
    },
    "FindExecutableW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.HINSTANCE",
      "setLastError": false
    },
    "ShellAboutA": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.UI.WindowsAndMessaging.HICON"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "ShellAboutW": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.UI.WindowsAndMessaging.HICON"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "DuplicateIcon": {
      "args": [
        "Windows.Win32.Foundation.HINSTANCE",
        "Windows.Win32.UI.WindowsAndMessaging.HICON"
      ],
      "returns": "Windows.Win32.UI.WindowsAndMessaging.HICON",
      "setLastError": false
    },
    "ExtractAssociatedIconA": {
      "args": [
        "Windows.Win32.Foundation.HINSTANCE",
        "Windows.Win32.Foundation.PSTR",
        "u16*"
      ],
      "returns": "Windows.Win32.UI.WindowsAndMessaging.HICON",
      "setLastError": false
    },
    "ExtractAssociatedIconW": {
      "args": [
        "Windows.Win32.Foundation.HINSTANCE",
        "Windows.Win32.Foundation.PWSTR",
        "u16*"
      ],
      "returns": "Windows.Win32.UI.WindowsAndMessaging.HICON",
      "setLastError": false
    },
    "ExtractAssociatedIconExA": {
      "args": [
        "Windows.Win32.Foundation.HINSTANCE",
        "Windows.Win32.Foundation.PSTR",
        "u16*",
        "u16*"
      ],
      "returns": "Windows.Win32.UI.WindowsAndMessaging.HICON",
      "setLastError": false
    },
    "ExtractAssociatedIconExW": {
      "args": [
        "Windows.Win32.Foundation.HINSTANCE",
        "Windows.Win32.Foundation.PWSTR",
        "u16*",
        "u16*"
      ],
      "returns": "Windows.Win32.UI.WindowsAndMessaging.HICON",
      "setLastError": false
    },
    "ExtractIconA": {
      "args": [
        "Windows.Win32.Foundation.HINSTANCE",
        "Windows.Win32.Foundation.PSTR",
        "u32"
      ],
      "returns": "Windows.Win32.UI.WindowsAndMessaging.HICON",
      "setLastError": false
    },
    "ExtractIconW": {
      "args": [
        "Windows.Win32.Foundation.HINSTANCE",
        "Windows.Win32.Foundation.PWSTR",
        "u32"
      ],
      "returns": "Windows.Win32.UI.WindowsAndMessaging.HICON",
      "setLastError": false
    },
    "SHAppBarMessage": {
      "args": [
        "u32",
        "Windows.Win32.UI.Shell.APPBARDATA*"
      ],
      "returns": "usize",
      "setLastError": false
    },
    "DoEnvironmentSubstA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "DoEnvironmentSubstW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "ExtractIconExA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "i32",
        "Windows.Win32.UI.WindowsAndMessaging.HICON*",
        "Windows.Win32.UI.WindowsAndMessaging.HICON*",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "ExtractIconExW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "i32",
        "Windows.Win32.UI.WindowsAndMessaging.HICON*",
        "Windows.Win32.UI.WindowsAndMessaging.HICON*",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "SHFileOperationA": {
      "args": [
        "Windows.Win32.UI.Shell.SHFILEOPSTRUCTA*"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "SHFileOperationW": {
      "args": [
        "Windows.Win32.UI.Shell.SHFILEOPSTRUCTW*"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "SHFreeNameMappings": {
      "args": [
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "void",
      "setLastError": false
    },
    "ShellExecuteExA": {
      "args": [
        "Windows.Win32.UI.Shell.SHELLEXECUTEINFOA*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ShellExecuteExW": {
      "args": [
        "Windows.Win32.UI.Shell.SHELLEXECUTEINFOW*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SHCreateProcessAsUserW": {
      "args": [
        "Windows.Win32.UI.Shell.SHCREATEPROCESSINFOW*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SHEvaluateSystemCommandTemplate": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR*",
        "Windows.Win32.Foundation.PWSTR*",
        "Windows.Win32.Foundation.PWSTR*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "AssocCreateForClasses": {
      "args": [
        "Windows.Win32.UI.Shell.ASSOCIATIONELEMENT*",
        "u32",
        "System.Guid*",
        "void**"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "SHQueryRecycleBinA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.UI.Shell.SHQUERYRBINFO*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "SHQueryRecycleBinW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.UI.Shell.SHQUERYRBINFO*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "SHEmptyRecycleBinA": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.PSTR",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "SHEmptyRecycleBinW": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "Windows.Win32.Foundation.PWSTR",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "SHQueryUserNotificationState": {
      "args": [
        "Windows.Win32.UI.Shell.QUERY_USER_NOTIFICATION_STATE*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "Shell_NotifyIconA": {
      "args": [
        "Windows.Win32.UI.Shell.NOTIFY_ICON_MESSAGE",
        "Windows.Win32.UI.Shell.NOTIFYICONDATAA*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "Shell_NotifyIconW": {
      "args": [
        "Windows.Win32.UI.Shell.NOTIFY_ICON_MESSAGE",
        "Windows.Win32.UI.Shell.NOTIFYICONDATAW*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "Shell_NotifyIconGetRect": {
      "args": [
        "Windows.Win32.UI.Shell.NOTIFYICONIDENTIFIER*",
        "Windows.Win32.Foundation.RECT*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "SHGetFileInfoA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Storage.FileSystem.FILE_FLAGS_AND_ATTRIBUTES",
        "Windows.Win32.UI.Shell.SHFILEINFOA*",
        "u32",
        "Windows.Win32.UI.Shell.SHGFI_FLAGS"
      ],
      "returns": "usize",
      "setLastError": false
    },
    "SHGetFileInfoW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Storage.FileSystem.FILE_FLAGS_AND_ATTRIBUTES",
        "Windows.Win32.UI.Shell.SHFILEINFOW*",
        "u32",
        "Windows.Win32.UI.Shell.SHGFI_FLAGS"
      ],
      "returns": "usize",
      "setLastError": false
    },
    "SHGetStockIconInfo": {
      "args": [
        "Windows.Win32.UI.Shell.SHSTOCKICONID",
        "Windows.Win32.UI.Shell.SHGSI_FLAGS",
        "Windows.Win32.UI.Shell.SHSTOCKICONINFO*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "SHGetDiskFreeSpaceExA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "u64*",
        "u64*",
        "u64*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SHGetDiskFreeSpaceExW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "u64*",
        "u64*",
        "u64*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SHGetNewLinkInfoA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.BOOL*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SHGetNewLinkInfoW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.BOOL*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SHInvokePrinterCommandA": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "u32",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SHInvokePrinterCommandW": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "u32",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SHLoadNonloadedIconOverlayIdentifiers": {
      "args": [],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "SHIsFileAvailableOffline": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "SHSetLocalizedName": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "i32"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "SHRemoveLocalizedName": {
      "args": [
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "SHGetLocalizedName": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "i32*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "IsLFNDriveA": {
      "args": [
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "IsLFNDriveW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SHEnumerateUnreadMailAccountsW": {
      "args": [
        "Windows.Win32.System.Registry.HKEY",
        "u32",
        "Windows.Win32.Foundation.PWSTR",
        "i32"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "SHGetUnreadMailCountW": {
      "args": [
        "Windows.Win32.System.Registry.HKEY",
        "Windows.Win32.Foundation.PWSTR",
        "u32*",
        "Windows.Win32.Foundation.FILETIME*",
        "Windows.Win32.Foundation.PWSTR",
        "i32"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "SHSetUnreadMailCountW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "SHTestTokenMembership": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SHGetImageList": {
      "args": [
        "i32",
        "System.Guid*",
        "void**"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "InitNetworkAddressControl": {
      "args": [],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SHGetDriveMedia": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "SHGetPropertyStoreFromIDList": {
      "args": [
        "Windows.Win32.UI.Shell.Common.ITEMIDLIST*",
        "Windows.Win32.UI.Shell.PropertiesSystem.GETPROPERTYSTOREFLAGS",
        "System.Guid*",
        "void**"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "SHGetPropertyStoreFromParsingName": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.System.Com.IBindCtx",
        "Windows.Win32.UI.Shell.PropertiesSystem.GETPROPERTYSTOREFLAGS",
        "System.Guid*",
        "void**"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "SHAddDefaultPropertiesByExt": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.UI.Shell.PropertiesSystem.IPropertyStore"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "PifMgr_OpenProperties": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "PifMgr_GetProperties": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Foundation.PSTR",
        "void*",
        "i32",
        "u32"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "PifMgr_SetProperties": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Foundation.PSTR",
        "void*",
        "i32",
        "u32"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "PifMgr_CloseProperties": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "SHPropStgCreate": {
      "args": [
        "Windows.Win32.System.Com.StructuredStorage.IPropertySetStorage",
        "System.Guid*",
        "System.Guid*",
        "u32",
        "u32",
        "u32",
        "Windows.Win32.System.Com.StructuredStorage.IPropertyStorage*",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "SHPropStgReadMultiple": {
      "args": [
        "Windows.Win32.System.Com.StructuredStorage.IPropertyStorage",
        "u32",
        "u32",
        "Windows.Win32.System.Com.StructuredStorage.PROPSPEC*",
        "Windows.Win32.System.Com.StructuredStorage.PROPVARIANT*"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "SHPropStgWriteMultiple": {
      "args": [
        "Windows.Win32.System.Com.StructuredStorage.IPropertyStorage",
        "u32*",
        "u32",
        "Windows.Win32.System.Com.StructuredStorage.PROPSPEC*",
        "Windows.Win32.System.Com.StructuredStorage.PROPVARIANT*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    },
    "SHGetPropertyStoreForWindow": {
      "args": [
        "Windows.Win32.Foundation.HWND",
        "System.Guid*",
        "void**"
      ],
      "returns": "Windows.Win32.Foundation.HRESULT",
      "setLastError": false
    }
  }
} as const;
const libraries = {
  "shell32.dll": {
    "#660": {
      "args": [
        "FFIType.i32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHSimpleIDListFromPath": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "SHCreateItemFromIDList": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHCreateItemFromParsingName": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHCreateItemWithParent": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHCreateItemFromRelativeName": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHCreateItemInKnownFolder": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHGetIDListFromObject": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHGetItemFromObject": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHGetNameFromIDList": {
      "args": [
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHGetItemFromDataObject": {
      "args": [
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHCreateShellItemArray": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHCreateShellItemArrayFromDataObject": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHCreateShellItemArrayFromIDLists": {
      "args": [
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHCreateShellItemArrayFromShellItem": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHCreateAssociationRegistration": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHCreateDefaultExtractIcon": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SetCurrentProcessExplicitAppUserModelID": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "GetCurrentProcessExplicitAppUserModelID": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHGetTemporaryPropertyForItem": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHSetTemporaryPropertyForItem": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHShowManageLibraryUI": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.i32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHResolveLibrary": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHAssocEnumHandlers": {
      "args": [
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHAssocEnumHandlersForProtocolByApplication": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHCreateDefaultPropertiesOp": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHSetDefaultProperties": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHGetMalloc": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHAlloc": {
      "args": [
        "FFIType.usize"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "SHFree": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.void",
      "setLastError": false
    },
    "SHGetIconOverlayIndexA": {
      "args": [
        "FFIType.ptr",
        "FFIType.i32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHGetIconOverlayIndexW": {
      "args": [
        "FFIType.ptr",
        "FFIType.i32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "ILClone": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "ILCloneFirst": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "ILCombine": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "ILFree": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.void",
      "setLastError": false
    },
    "ILGetNext": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "ILGetSize": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "ILFindChild": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "ILFindLastID": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "ILRemoveLastID": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "ILIsEqual": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "ILIsParent": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.i32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "ILSaveToStream": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "ILLoadFromStreamEx": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "ILCreateFromPathA": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "ILCreateFromPathW": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "SHILCreateFromPath": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "ILAppendID": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.i32"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "SHGetPathFromIDListEx": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHGetPathFromIDListA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHGetPathFromIDListW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHCreateDirectory": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHCreateDirectoryExA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHCreateDirectoryExW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHOpenFolderAndSelectItems": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHCreateShellItem": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHGetSpecialFolderLocation": {
      "args": [
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHCloneSpecialIDList": {
      "args": [
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.i32"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "SHGetSpecialFolderPathA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.i32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHGetSpecialFolderPathW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.i32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHFlushSFCache": {
      "args": [],
      "returns": "FFIType.void",
      "setLastError": false
    },
    "SHGetFolderPathA": {
      "args": [
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHGetFolderPathW": {
      "args": [
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHGetFolderLocation": {
      "args": [
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHSetFolderPathA": {
      "args": [
        "FFIType.i32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHSetFolderPathW": {
      "args": [
        "FFIType.i32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHGetFolderPathAndSubDirA": {
      "args": [
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHGetFolderPathAndSubDirW": {
      "args": [
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHGetKnownFolderIDList": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHSetKnownFolderPath": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHGetKnownFolderPath": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHGetKnownFolderItem": {
      "args": [
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHGetSetFolderCustomSettings": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHBrowseForFolderA": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "SHBrowseForFolderW": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "SHLoadInProc": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHGetDesktopFolder": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHChangeNotify": {
      "args": [
        "FFIType.i32",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.void",
      "setLastError": false
    },
    "SHAddToRecentDocs": {
      "args": [
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.void",
      "setLastError": false
    },
    "SHHandleUpdateImage": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHUpdateImageA": {
      "args": [
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.u32",
        "FFIType.i32"
      ],
      "returns": "FFIType.void",
      "setLastError": false
    },
    "SHUpdateImageW": {
      "args": [
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.u32",
        "FFIType.i32"
      ],
      "returns": "FFIType.void",
      "setLastError": false
    },
    "SHChangeNotifyRegister": {
      "args": [
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.i32",
        "FFIType.u32",
        "FFIType.i32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "SHChangeNotifyDeregister": {
      "args": [
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHChangeNotification_Lock": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "SHChangeNotification_Unlock": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHGetRealIDL": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHGetInstanceExplorer": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHGetDataFromIDListA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.ptr",
        "FFIType.i32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHGetDataFromIDListW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.ptr",
        "FFIType.i32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "RestartDialog": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "RestartDialogEx": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHCoCreateInstance": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHCreateDataObject": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CIDLData_CreateFromIDArray": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHCreateStdEnumFmtEtc": {
      "args": [
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHDoDragDrop": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "DAD_SetDragImage": {
      "args": [
        "FFIType.isize",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "DAD_DragEnterEx": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "DAD_DragEnterEx2": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "DAD_ShowDragImage": {
      "args": [
        "FFIType.i32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "DAD_DragMove": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "DAD_DragLeave": {
      "args": [],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "DAD_AutoScroll": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "ReadCabinetState": {
      "args": [
        "FFIType.ptr",
        "FFIType.i32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "WriteCabinetState": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "PathMakeUniqueName": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "PathIsExe": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "PathCleanupSpec": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "PathResolve": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "GetFileNameFromBrowse": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "DriveType": {
      "args": [
        "FFIType.i32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "RealDriveType": {
      "args": [
        "FFIType.i32",
        "FFIType.i32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "IsNetDrive": {
      "args": [
        "FFIType.i32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "Shell_MergeMenus": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.u32"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "SHObjectProperties": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHFormatDrive": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.u32"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "SHDestroyPropSheetExtArray": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.void",
      "setLastError": false
    },
    "SHAddFromPropSheetExtArray": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.isize"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "SHReplaceFromPropSheetExtArray": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.isize"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "OpenRegStream": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "SHFindFiles": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "PathGetShortPath": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.void",
      "setLastError": false
    },
    "PathYetAnotherMakeUniqueName": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "Win32DeleteFile": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHRestricted": {
      "args": [
        "FFIType.i32"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "SignalFileOpen": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "AssocGetDetailsOfPropKey": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHStartNetConnectionDialogW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHDefExtractIconA": {
      "args": [
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHDefExtractIconW": {
      "args": [
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHOpenWithDialog": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "Shell_GetImageLists": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "Shell_GetCachedImageIndex": {
      "args": [
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "Shell_GetCachedImageIndexA": {
      "args": [
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "Shell_GetCachedImageIndexW": {
      "args": [
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHValidateUNC": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHSetInstanceExplorer": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.void",
      "setLastError": false
    },
    "IsUserAnAdmin": {
      "args": [],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHShellFolderView_Message": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.isize"
      ],
      "returns": "FFIType.isize",
      "setLastError": false
    },
    "SHCreateShellFolderView": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CDefFolderMenu_Create2": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHCreateDefaultContextMenu": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHFind_InitMenuPopup": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "SHCreateShellFolderViewEx": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHGetSetSettings": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.i32"
      ],
      "returns": "FFIType.void",
      "setLastError": false
    },
    "SHGetSettings": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.void",
      "setLastError": false
    },
    "SHBindToParent": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHBindToFolderIDListParent": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHBindToFolderIDListParentEx": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHBindToObject": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHParseDisplayName": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHPathPrepareForWriteA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHPathPrepareForWriteW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHCreateFileExtractIconW": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHLimitInputEdit": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHGetAttributesFromDataObject": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHMapPIDLToSystemImageListIndex": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHCLSIDFromString": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "PickIconDlg": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "StgMakeUniqueName": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHChangeNotifyRegisterThread": {
      "args": [
        "FFIType.i32"
      ],
      "returns": "FFIType.void",
      "setLastError": false
    },
    "PathQualify": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.void",
      "setLastError": false
    },
    "PathIsSlowA": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "PathIsSlowW": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHCreatePropSheetExtArray": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "SHOpenPropSheetW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHMultiFileProperties": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHCreateQueryCancelAutoPlayMoniker": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "CommandLineToArgvW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "DragQueryFileA": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "DragQueryFileW": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "DragQueryPoint": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "DragFinish": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.void",
      "setLastError": false
    },
    "DragAcceptFiles": {
      "args": [
        "FFIType.ptr",
        "FFIType.i32"
      ],
      "returns": "FFIType.void",
      "setLastError": false
    },
    "ShellExecuteA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.i32"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "ShellExecuteW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.i32"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "FindExecutableA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "FindExecutableW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "ShellAboutA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "ShellAboutW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "DuplicateIcon": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "ExtractAssociatedIconA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "ExtractAssociatedIconW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "ExtractAssociatedIconExA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "ExtractAssociatedIconExW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "ExtractIconA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "ExtractIconW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "SHAppBarMessage": {
      "args": [
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.usize",
      "setLastError": false
    },
    "DoEnvironmentSubstA": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "DoEnvironmentSubstW": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "ExtractIconExA": {
      "args": [
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "ExtractIconExW": {
      "args": [
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.u32",
      "setLastError": false
    },
    "SHFileOperationA": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHFileOperationW": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHFreeNameMappings": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.void",
      "setLastError": false
    },
    "ShellExecuteExA": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "ShellExecuteExW": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHCreateProcessAsUserW": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHEvaluateSystemCommandTemplate": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "AssocCreateForClasses": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHQueryRecycleBinA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHQueryRecycleBinW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHEmptyRecycleBinA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHEmptyRecycleBinW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHQueryUserNotificationState": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "Shell_NotifyIconA": {
      "args": [
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "Shell_NotifyIconW": {
      "args": [
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "Shell_NotifyIconGetRect": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHGetFileInfoA": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32"
      ],
      "returns": "FFIType.usize",
      "setLastError": false
    },
    "SHGetFileInfoW": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32"
      ],
      "returns": "FFIType.usize",
      "setLastError": false
    },
    "SHGetStockIconInfo": {
      "args": [
        "FFIType.i32",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHGetDiskFreeSpaceExA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHGetDiskFreeSpaceExW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHGetNewLinkInfoA": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHGetNewLinkInfoW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHInvokePrinterCommandA": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.i32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHInvokePrinterCommandW": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.i32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHLoadNonloadedIconOverlayIdentifiers": {
      "args": [],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHIsFileAvailableOffline": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHSetLocalizedName": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.i32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHRemoveLocalizedName": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHGetLocalizedName": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "IsLFNDriveA": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "IsLFNDriveW": {
      "args": [
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHEnumerateUnreadMailAccountsW": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.i32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHGetUnreadMailCountW": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.i32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHSetUnreadMailCountW": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHTestTokenMembership": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHGetImageList": {
      "args": [
        "FFIType.i32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "InitNetworkAddressControl": {
      "args": [],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHGetDriveMedia": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHGetPropertyStoreFromIDList": {
      "args": [
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHGetPropertyStoreFromParsingName": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHAddDefaultPropertiesByExt": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "PifMgr_OpenProperties": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "PifMgr_GetProperties": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "PifMgr_SetProperties": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.i32",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "PifMgr_CloseProperties": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.ptr",
      "setLastError": false
    },
    "SHPropStgCreate": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHPropStgReadMultiple": {
      "args": [
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHPropStgWriteMultiple": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32",
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.u32"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    },
    "SHGetPropertyStoreForWindow": {
      "args": [
        "FFIType.ptr",
        "FFIType.ptr",
        "FFIType.ptr"
      ],
      "returns": "FFIType.i32",
      "setLastError": false
    }
  }
} as const;
const defaults = {
  "shell32.dll": {
    "SHGetIconOverlayIndex": "SHGetIconOverlayIndexW",
    "ILCreateFromPath": "ILCreateFromPathW",
    "SHGetPathFromIDList": "SHGetPathFromIDListW",
    "SHCreateDirectoryEx": "SHCreateDirectoryExW",
    "SHGetSpecialFolderPath": "SHGetSpecialFolderPathW",
    "SHGetFolderPath": "SHGetFolderPathW",
    "SHSetFolderPath": "SHSetFolderPathW",
    "SHGetFolderPathAndSubDir": "SHGetFolderPathAndSubDirW",
    "SHBrowseForFolder": "SHBrowseForFolderW",
    "SHUpdateImage": "SHUpdateImageW",
    "SHGetDataFromIDList": "SHGetDataFromIDListW",
    "SHDefExtractIcon": "SHDefExtractIconW",
    "Shell_GetCachedImageIndex": "Shell_GetCachedImageIndexW",
    "SHPathPrepareForWrite": "SHPathPrepareForWriteW",
    "PathIsSlow": "PathIsSlowW",
    "DragQueryFile": "DragQueryFileW",
    "ShellExecute": "ShellExecuteW",
    "FindExecutable": "FindExecutableW",
    "ShellAbout": "ShellAboutW",
    "ExtractAssociatedIcon": "ExtractAssociatedIconW",
    "ExtractAssociatedIconEx": "ExtractAssociatedIconExW",
    "ExtractIcon": "ExtractIconW",
    "DoEnvironmentSubst": "DoEnvironmentSubstW",
    "ExtractIconEx": "ExtractIconExW",
    "SHFileOperation": "SHFileOperationW",
    "ShellExecuteEx": "ShellExecuteExW",
    "SHQueryRecycleBin": "SHQueryRecycleBinW",
    "SHEmptyRecycleBin": "SHEmptyRecycleBinW",
    "Shell_NotifyIcon": "Shell_NotifyIconW",
    "SHGetFileInfo": "SHGetFileInfoW",
    "SHGetDiskFreeSpaceEx": "SHGetDiskFreeSpaceExW",
    "SHGetNewLinkInfo": "SHGetNewLinkInfoW",
    "SHInvokePrinterCommand": "SHInvokePrinterCommandW",
    "IsLFNDrive": "IsLFNDriveW"
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
  return result as { "shell32.dll": shell32Library };
}
