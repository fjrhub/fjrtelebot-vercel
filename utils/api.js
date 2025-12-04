export const APIs = {
    waifuim: "https://api.waifu.im",
    waifupics: "https://api.waifu.pics",
    siputzx: "https://api.siputzx.my.id",
    myquran: "https://api.myquran.com",
    archive: "https://archive.lick.eu.org",
    vreden: "https://api.vreden.my.id"
};

export function createUrl(name, path) {
    if (!APIs[name]) throw new Error(`API '${name}' not found in APIs list`);
    return `${APIs[name]}${path}`;
}