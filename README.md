<p align="center"><img src="build/icon.png" width="128" alt="Comet Launcher"></p>

# Comet Launcher

Launcher de Minecraft para **Windows e Linux** (Electron + React/TypeScript), inspirado no [Prism Launcher](https://prismlauncher.org).

## Instalar

Descarrega a versão mais recente na página de [Releases](https://github.com/filgamepro1234/comet-launcher/releases):

| Sistema | Ficheiro | Como instalar |
| --- | --- | --- |
| Windows | `Comet Launcher-Setup-x.y.z.exe` | Executa o instalador |
| Linux (qualquer distro) | `Comet Launcher-x.y.z-linux-x86_64.AppImage` | `chmod +x` e executa |
| Debian / Ubuntu / Mint | `Comet Launcher-x.y.z-linux-amd64.deb` | `sudo apt install ./ficheiro.deb` |

> **Ubuntu 24.04+ e AppImage:** se o AppImage não abrir, é a restrição do AppArmor às sandboxes do Chromium. Usa o `.deb` ou arranca com `--no-sandbox`.

## Funcionalidades

- **Vanilla e modded** — download automático de assets, libraries e Java (runtimes oficiais da Mojang, por versão e por sistema).
- **Mod loaders** — Fabric e Quilt (via meta API), Forge e NeoForge (installer oficial executado automaticamente num ambiente isolado).
- **Instâncias isoladas** — cada instância tem a sua `.minecraft` própria (mods, config, saves, resourcepacks, screenshots), com grupos, duplicar, exportar para zip e atalhos no ambiente de trabalho.
- **Contas** — login Microsoft (device code flow), perfis offline, várias contas com troca rápida.
- **Mods** — pesquisa estilo Modrinth (filtros por versão, loader e categorias, ordenação), instalação e atualização via Modrinth e CurseForge com resolução de dependências; ativar/desativar sem apagar e deteção de conflitos.
- **Modpacks** — importar `.mrpack` e zips do CurseForge, ou instalar diretamente da pesquisa.
- **Resource packs** — instalação com um clique para a pasta `resourcepacks` da instância.
- **Extras** — galeria de screenshots, consola do jogo em tempo real, RAM/JVM args/Java/resolução por instância, tempo de jogo.

## Pastas

Usa a mesma pasta do launcher oficial, por isso o que já descarregaste é reaproveitado:

| Sistema | Pasta do jogo |
| --- | --- |
| Windows | `%APPDATA%\.minecraft` |
| Linux | `~/.minecraft` |

```
assets/  libraries/  versions/   partilhados com o launcher oficial
comet/
  instances/<id>/
    instance.json    config da instância (RAM, JVM args, loader, grupo…)
    mods-meta.json   origem/versão dos mods instalados (para updates)
    .minecraft/      mods, config, saves, resourcepacks, screenshots
  java/              runtimes Java descarregados da Mojang
  settings.json  accounts.json
```

## Configuração

**CurseForge (opcional):** a API exige uma chave gratuita — cria-a em [console.curseforge.com](https://console.curseforge.com) e cola-a em Definições. O Modrinth funciona sem configuração.

**Login Microsoft:** o device code flow precisa de um Azure Client ID próprio (gratuito): [portal.azure.com](https://portal.azure.com) → *App registrations* → *New registration* → *Personal Microsoft accounts only* → *Authentication* → ativa **Allow public client flows** → cola o *Application (client) ID* em Definições. Sem isto podes usar contas offline.

## Desenvolvimento

```bash
npm install
npm run dev          # arranca em modo dev
npm run typecheck
npm run dist:win     # instalador Windows (NSIS) em dist/
npm run dist:linux   # AppImage + .deb em dist/ (correr em Linux)
```

Cada push para `main` compila os instaladores dos dois sistemas no GitHub Actions. Para publicar uma versão:

```bash
git tag v0.1.0
git push origin v0.1.0
```

O workflow cria automaticamente a release com o `.exe`, o `.AppImage` e o `.deb`.

## Arquitetura

- `src/main` — processo principal: downloads, instalação de versões/loaders, autenticação, lançamento do jogo, APIs Modrinth/CurseForge.
- `src/preload` — ponte IPC segura (contextIsolation).
- `src/renderer` — interface React.
- `src/shared` — tipos partilhados entre processos.

## Licença

MIT
