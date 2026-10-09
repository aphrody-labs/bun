# WSLg environment of Aphrody Alpine (login shells; `wsl -d AphrodyAlpine -- sh -lc '<cmd>'`).
# Wayland first (WSLg's Weston), GPU through /dev/dxg with Mesa d3d12 (GL/GLES) and dozen
# (Vulkan), llvmpipe/lavapipe when the D3D12 drivers or the GPU are missing.
if [ -d /mnt/wslg ]; then
	: "${XDG_RUNTIME_DIR:=/mnt/wslg/runtime-dir}"
	: "${WAYLAND_DISPLAY:=wayland-0}"
	export XDG_RUNTIME_DIR WAYLAND_DISPLAY
	# Toolkits: Wayland, X11 (XWayland) as fallback.
	export GDK_BACKEND="${GDK_BACKEND:-wayland,x11}"
	export QT_QPA_PLATFORM="${QT_QPA_PLATFORM:-wayland;xcb}"
	export SDL_VIDEODRIVER="${SDL_VIDEODRIVER:-wayland,x11}"
	export ELECTRON_OZONE_PLATFORM_HINT="${ELECTRON_OZONE_PLATFORM_HINT:-wayland}"
	# WebKitGTK (Tauri on Linux): WSLg has no dmabuf import, the DMA-BUF renderer draws blank.
	export WEBKIT_DISABLE_DMABUF_RENDERER="${WEBKIT_DISABLE_DMABUF_RENDERER:-1}"

	# Opt-in (APHRODY_D3D12=1): WSL's glibc libd3d12.so aborts under musl+gcompat on its first
	# device (std::system_error from its C++ runtime), so d3d12/dozen stay off by default.
	_aphrody_arch=$(uname -m)
	if [ "${APHRODY_D3D12:-0}" = 1 ] && [ -e /dev/dxg ] && [ -e /usr/lib/wsl/lib/libd3d12.so ] && [ -e /usr/lib/dri/d3d12_dri.so ]; then
		export GALLIUM_DRIVER="${GALLIUM_DRIVER:-d3d12}"
		# Pick the adapter by name substring when several GPUs exist, e.g. NVIDIA.
		[ -n "${APHRODY_GPU:-}" ] && export MESA_D3D12_DEFAULT_ADAPTER_NAME="$APHRODY_GPU"
	fi
	if [ "${APHRODY_D3D12:-0}" = 1 ] && [ -e /dev/dxg ] && [ -e "/usr/share/vulkan/icd.d/dzn_icd.$_aphrody_arch.json" ]; then
		export VK_DRIVER_FILES="${VK_DRIVER_FILES:-/usr/share/vulkan/icd.d/dzn_icd.$_aphrody_arch.json}"
		# wgpu apps reading Backends::from_env(): Vulkan through dozen.
		export WGPU_BACKEND="${WGPU_BACKEND:-vulkan}"
	else
		# No dozen: wgpu over GL (d3d12 Gallium or llvmpipe) is faster than lavapipe.
		export WGPU_BACKEND="${WGPU_BACKEND:-gl}"
	fi
	unset _aphrody_arch
fi
