// Dancing Bitmoji: your own avatar inside Snapchat, a bundled default avatar everywhere else.

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

// Your Bitmoji when a Snapchat host serves one; the bundled default avatar on the desktop stub, for a user
// without one, or when it fails to load.
async function loadAvatar() {
    await snapchat.init();
    if (snapchat.isSupported('bitmoji') && !snapchat.isStub) {
        try {
            const { hasAvatar } = await snapchat.bitmoji.getAvatarInfo();
            if (hasAvatar) {
                const asset = await loadAsset('avatar', 'container', (await snapchat.bitmoji.get3DAvatar()).url);
                return { asset, source: 'your Bitmoji' };
            }
        } catch (e) {
            console.warn('bitmoji unavailable, using the default avatar:', e.message);
        }
    }
    return { asset: await loadAsset('avatar', 'container', 'assets/avatar_default.glb'), source: 'default Bitmoji' };
}

async function main() {
    const [{ asset: avatarAsset, source }, danceAsset] = await Promise.all([loadAvatar(), loadAsset('dance', 'container', 'assets/dance.glb')]);

    const avatar = avatarAsset.resource.instantiateRenderEntity();
    app.root.addChild(avatar);

    // The dance is authored on the Bitmoji rig, so the clip plays on any user's avatar as-is.
    avatar.addComponent('anim');
    avatar.anim.assignAnimation('Dance', danceAsset.resource.animations[0].resource);

    document.getElementById('status').textContent = source;
    app.start();
}

main().catch((e) => {
    document.getElementById('status').textContent = `failed: ${e.message}`;
    console.error(e);
});
