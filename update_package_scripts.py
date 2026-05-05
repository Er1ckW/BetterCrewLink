import json

with open("package.json", "r") as f:
    data = json.load(f)

data["scripts"]["dev"] = "vite"
data["scripts"]["build"] = "vite build"
data["scripts"]["compile"] = "vite build"
if "electronWebpack" in data:
    del data["electronWebpack"]
data["main"] = "dist-electron/main/index.js"

with open("package.json", "w") as f:
    json.dump(data, f, indent="\t")
