.SUFFIXES: .hlsl

# Vertex Shaders

$(OBJ_PATH)\$(O)\custom_shader_vs.h: custom_shader_vs.hlsl
    @$(ECHO) Compiling shader $(*F)...
    $(FXC) $(FXC_FLAGS) /Tvs_$(FXC_PROFILE_VERSION) /Fh"$@" /Vn$(*B) $?

$(OBJ_PATH)\$(O)\shader_vs.h: shader_vs.hlsl
    @$(ECHO) Compiling shader $(*F)...
    $(FXC) $(FXC_FLAGS) /Tvs_$(FXC_PROFILE_VERSION) /Fh"$@" /Vn$(*B) $?

# Pixel Shaders

$(OBJ_PATH)\$(O)\custom_shader_ps.h: custom_shader_ps.hlsl
    @$(ECHO) Compiling shader $(*F)...
    $(FXC) $(FXC_FLAGS) /Tps_$(FXC_PROFILE_VERSION) /Fh"$@" /Vn$(*B) $?

$(OBJ_PATH)\$(O)\shader_ps.h: shader_ps.hlsl
    @$(ECHO) Compiling shader $(*F)...
    $(FXC) $(FXC_FLAGS) /Tps_$(FXC_PROFILE_VERSION) /Fh"$@" /Vn$(*B) $?

# Direct3D 12 variants (BackendD3D12): shader model 5.1 with embedded root signatures

$(OBJ_PATH)\$(O)\custom_shader_vs_d3d12.h: custom_shader_vs_d3d12.hlsl custom_shader_vs.hlsl shader_d3d12_rootsig.hlsl
    @$(ECHO) Compiling shader $(*F)...
    $(FXC) $(FXC_FLAGS) /Tvs_5_1 /Fh"$@" /Vn$(*B) custom_shader_vs_d3d12.hlsl

$(OBJ_PATH)\$(O)\shader_vs_d3d12.h: shader_vs_d3d12.hlsl shader_vs.hlsl shader_d3d12_rootsig.hlsl
    @$(ECHO) Compiling shader $(*F)...
    $(FXC) $(FXC_FLAGS) /Tvs_5_1 /Fh"$@" /Vn$(*B) shader_vs_d3d12.hlsl

$(OBJ_PATH)\$(O)\custom_shader_ps_d3d12.h: custom_shader_ps_d3d12.hlsl custom_shader_ps.hlsl
    @$(ECHO) Compiling shader $(*F)...
    $(FXC) $(FXC_FLAGS) /Tps_5_1 /Fh"$@" /Vn$(*B) custom_shader_ps_d3d12.hlsl

$(OBJ_PATH)\$(O)\shader_ps_d3d12.h: shader_ps_d3d12.hlsl shader_ps.hlsl
    @$(ECHO) Compiling shader $(*F)...
    $(FXC) $(FXC_FLAGS) /Tps_5_1 /Fh"$@" /Vn$(*B) shader_ps_d3d12.hlsl
