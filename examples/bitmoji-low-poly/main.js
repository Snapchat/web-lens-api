// Low-poly Bitmoji: the smaller, meshopt-compressed avatar from get3DAvatar(), playing the same dance clip.

// 'low' meshes use EXT_meshopt_compression; the engine imports this decoder the first time a model needs it.
pc.meshoptInitialize({ url: 'meshopt_decoder.mjs' });

const app = new pc.Application(document.getElementById('app'), { graphicsDeviceOptions: { antialias: true } });
app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);
app.setCanvasResolution(pc.RESOLUTION_AUTO);
window.addEventListener('resize', () => app.resizeCanvas());

const camera = new pc.Entity('camera');
camera.addComponent('camera', { clearColor: new pc.Color(0.11, 0.11, 0.18) });
camera.setPosition(0, 1.2, 2.6);
camera.lookAt(0, 0.85, 0);
app.root.addChild(camera);

const light = new pc.Entity('light');
light.addComponent('light', { type: 'directional', intensity: 1.4 });
light.setEulerAngles(50, 30, 0);
app.root.addChild(light);
app.scene.ambientLight = new pc.Color(0.45, 0.45, 0.55);

// Registers and loads an asset; resolves when it is ready, and rejects (unregistering it) on error.
function loadAsset(name, type, url) {
    const asset = new pc.Asset(name, type, { url });
    return new Promise((resolve, reject) => {
        asset.ready(() => resolve(asset));
        asset.once('error', (err) => {
            app.assets.remove(asset);
            reject(err);
        });
        app.assets.add(asset);
        app.assets.load(asset);
    });
}

// Your low-poly Bitmoji inside Snapchat (the full model before 14.33, which loads the same way); else a bundled one.
async function loadAvatar() {
    await snapchat.init();
    if (snapchat.isSupported('bitmoji') && !snapchat.isStub) {
        try {
            const { hasAvatar } = await snapchat.bitmoji.getAvatarInfo();
            if (hasAvatar) {
                const { url } = await snapchat.bitmoji.get3DAvatar({ meshQuality: 'low', textureQuality: 'low' });
                return { asset: await loadAsset('avatar', 'container', url), source: 'your Bitmoji, low quality' };
            }
        } catch (e) {
            console.warn('bitmoji unavailable, using the default avatar:', e.message);
        }
    }
    const asset = await loadAsset('avatar', 'container', 'assets/avatar_default_low.glb');
    return { asset, source: 'default Bitmoji, low quality' };
}

async function main() {
    const [{ asset: avatarAsset, source }, danceAsset] = await Promise.all([loadAvatar(), loadAsset('dance', 'container', 'dance.glb')]);

    const avatar = avatarAsset.resource.instantiateRenderEntity();
    app.root.addChild(avatar);

    // The low-poly model keeps the full rig, so the clip authored on it plays unchanged.
    avatar.addComponent('anim');
    avatar.anim.assignAnimation('Dance', danceAsset.resource.animations[0].resource);

    document.getElementById('status').textContent = source;
    app.start();
}

main().catch((e) => {
    document.getElementById('status').textContent = `failed: ${e.message}`;
    console.error(e);
});
