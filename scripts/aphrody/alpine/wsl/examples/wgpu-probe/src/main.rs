//! WSLg GPU probe: prints every wgpu adapter, then (unless --headless) opens a winit window,
//! clears it for --frames frames on the adapter picked for its surface and exits 0.
//!
//!   aphrody-wgpu-probe [--headless] [--frames N] [--title T]
//!
//! WGPU_BACKEND (vulkan, gl, ...) restricts the backends, see
//! scripts/aphrody/alpine/wsl/overlay/etc/profile.d/aphrody-wslg.sh.

use std::sync::Arc;
use std::time::Instant;

use winit::application::ApplicationHandler;
use winit::event::WindowEvent;
use winit::event_loop::{ActiveEventLoop, ControlFlow, EventLoop};
use winit::window::{Window, WindowId};

struct Args {
    headless: bool,
    frames: u32,
    title: String,
}

fn args() -> Args {
    let mut out = Args { headless: false, frames: 120, title: "Aphrody wgpu probe".into() };
    let mut it = std::env::args().skip(1);
    while let Some(a) = it.next() {
        match a.as_str() {
            "--headless" => out.headless = true,
            "--frames" => out.frames = it.next().and_then(|v| v.parse().ok()).expect("--frames N"),
            "--title" => out.title = it.next().expect("--title T"),
            other => panic!("unknown argument {other}"),
        }
    }
    out
}

fn describe(info: &wgpu::AdapterInfo) -> String {
    format!(
        "{} | backend={:?} type={:?} driver={} {}",
        info.name, info.backend, info.device_type, info.driver, info.driver_info
    )
}

struct Gpu {
    window: Arc<Window>,
    surface: wgpu::Surface<'static>,
    device: wgpu::Device,
    queue: wgpu::Queue,
    config: wgpu::SurfaceConfiguration,
}

struct App {
    instance: wgpu::Instance,
    args: Args,
    gpu: Option<Gpu>,
    frames: u32,
    start: Instant,
}

impl App {
    fn render(&mut self, event_loop: &ActiveEventLoop) {
        let Some(gpu) = self.gpu.as_mut() else { return };
        let frame = match gpu.surface.get_current_texture() {
            wgpu::CurrentSurfaceTexture::Success(frame) | wgpu::CurrentSurfaceTexture::Suboptimal(frame) => frame,
            wgpu::CurrentSurfaceTexture::Timeout | wgpu::CurrentSurfaceTexture::Occluded => {
                gpu.window.request_redraw();
                return;
            }
            other => {
                eprintln!("surface: {other:?}, reconfiguring");
                gpu.surface.configure(&gpu.device, &gpu.config);
                gpu.window.request_redraw();
                return;
            }
        };
        let view = frame.texture.create_view(&wgpu::TextureViewDescriptor::default());
        let mut encoder = gpu.device.create_command_encoder(&wgpu::CommandEncoderDescriptor::default());
        let t = self.frames as f64 / self.args.frames.max(1) as f64;
        {
            let _pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("clear"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &view,
                    depth_slice: None,
                    resolve_target: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Clear(wgpu::Color { r: 0.05, g: 0.2 + 0.6 * t, b: 0.45, a: 1.0 }),
                        store: wgpu::StoreOp::Store,
                    },
                })],
                ..Default::default()
            });
        }
        gpu.queue.submit([encoder.finish()]);
        gpu.window.pre_present_notify();
        gpu.queue.present(frame);
        self.frames += 1;
        if self.frames >= self.args.frames {
            let secs = self.start.elapsed().as_secs_f64();
            println!("frames: {} in {:.2}s ({:.1} fps)", self.frames, secs, self.frames as f64 / secs);
            event_loop.exit();
        } else {
            gpu.window.request_redraw();
        }
    }
}

impl ApplicationHandler for App {
    fn resumed(&mut self, event_loop: &ActiveEventLoop) {
        if self.gpu.is_some() {
            return;
        }
        let attrs = Window::default_attributes()
            .with_title(self.args.title.clone())
            .with_inner_size(winit::dpi::LogicalSize::new(640.0, 400.0));
        let window = Arc::new(event_loop.create_window(attrs).expect("create window"));
        let surface = self.instance.create_surface(window.clone()).expect("create surface");
        let adapter = pollster::block_on(self.instance.request_adapter(&wgpu::RequestAdapterOptions {
            power_preference: wgpu::PowerPreference::HighPerformance,
            compatible_surface: Some(&surface),
            force_fallback_adapter: false,
            apply_limit_buckets: false,
        }))
        .expect("no adapter for the window surface");
        println!("surface adapter: {}", describe(&adapter.get_info()));
        let (device, queue) =
            pollster::block_on(adapter.request_device(&wgpu::DeviceDescriptor::default())).expect("request device");
        let size = window.inner_size();
        let config = surface
            .get_default_config(&adapter, size.width.max(1), size.height.max(1))
            .expect("surface unsupported by adapter");
        surface.configure(&device, &config);
        println!("window: {}x{} {:?}", config.width, config.height, config.format);
        self.start = Instant::now();
        window.request_redraw();
        self.gpu = Some(Gpu { window, surface, device, queue, config });
    }

    fn window_event(&mut self, event_loop: &ActiveEventLoop, _id: WindowId, event: WindowEvent) {
        match event {
            WindowEvent::CloseRequested => event_loop.exit(),
            WindowEvent::Resized(size) => {
                if let Some(gpu) = self.gpu.as_mut() {
                    gpu.config.width = size.width.max(1);
                    gpu.config.height = size.height.max(1);
                    gpu.surface.configure(&gpu.device, &gpu.config);
                }
            }
            WindowEvent::RedrawRequested => self.render(event_loop),
            _ => {}
        }
    }
}

fn main() {
    let args = args();
    // The GL backend (EGL on Wayland) needs the display handle when the instance is created.
    let event_loop = if args.headless {
        None
    } else {
        Some(EventLoop::new().expect("event loop (WAYLAND_DISPLAY/DISPLAY?)"))
    };
    let desc = match &event_loop {
        Some(el) => wgpu::InstanceDescriptor::new_with_display_handle_from_env(Box::new(el.owned_display_handle())),
        None => wgpu::InstanceDescriptor::new_without_display_handle_from_env(),
    };
    let instance = wgpu::Instance::new(desc);
    let adapters = pollster::block_on(instance.enumerate_adapters(wgpu::Backends::all()));
    if adapters.is_empty() {
        eprintln!("no wgpu adapter");
        std::process::exit(1);
    }
    for adapter in &adapters {
        println!("adapter: {}", describe(&adapter.get_info()));
    }
    let Some(event_loop) = event_loop else {
        let adapter = &adapters[0];
        let (device, _queue) =
            pollster::block_on(adapter.request_device(&wgpu::DeviceDescriptor::default())).expect("request device");
        println!("device: ok (max_texture_dimension_2d={})", device.limits().max_texture_dimension_2d);
        return;
    };
    event_loop.set_control_flow(ControlFlow::Poll);
    let mut app = App { instance, args, gpu: None, frames: 0, start: Instant::now() };
    event_loop.run_app(&mut app).expect("run app");
}
