export function HelpPage() {
  return (
    <>
      <div className="page-title">Ajuda</div>
      <div className="section">
        <h4>Primeiros passos</h4>
        <div className="hint">
          1. Cria uma conta (Microsoft para online, ou offline) na barra superior → Contas.
          <br />
          2. Usa «Nova instância» para escolheres a versão do Minecraft e o mod loader (Fabric, Quilt, Forge,
          NeoForge).
          <br />
          3. Seleciona a instância e carrega em «Lançar» — o launcher descarrega automaticamente o jogo, as
          bibliotecas e o Java correto.
          <br />
          4. Em «Explorar» podes instalar mods, resource packs e modpacks do Modrinth e do CurseForge.
        </div>
      </div>
      <div className="section">
        <h4>Pastas</h4>
        <div className="hint">
          Os dados do jogo ficam em <b>%APPDATA%\.minecraft</b> no Windows e em <b>~/.minecraft</b> no Linux
          (mesmo layout do launcher oficial — assets,
          libraries e versions são partilhados e reaproveitados). As instâncias do Comet vivem em{' '}
          <b>.minecraft/comet/instances</b>, cada uma com a sua pasta <b>.minecraft</b> isolada (mods,
          config, saves, resourcepacks, screenshots).
        </div>
      </div>
      <div className="section">
        <h4>CurseForge</h4>
        <div className="hint">
          A pesquisa/instalação do CurseForge precisa de uma API key gratuita: cria-a em{' '}
          <a href="https://console.curseforge.com" target="_blank" rel="noreferrer">
            console.curseforge.com
          </a>{' '}
          e cola-a nas Definições.
        </div>
      </div>
      <div className="section">
        <h4>Login Microsoft</h4>
        <div className="hint">
          O login online usa o device code flow e precisa de um Azure Client ID próprio (gratuito):{' '}
          <a href="https://portal.azure.com" target="_blank" rel="noreferrer">
            portal.azure.com
          </a>{' '}
          → App registrations → New registration → «Personal Microsoft accounts only» → Authentication → ativa
          «Allow public client flows» → copia o Application (client) ID para as Definições.
        </div>
      </div>
      <div className="section">
        <h4>Sobre</h4>
        <div className="hint">
          Comet Launcher 0.1.0 — inspirado no{' '}
          <a href="https://prismlauncher.org" target="_blank" rel="noreferrer">
            Prism Launcher
          </a>
          . Construído com Electron + React + TypeScript.
        </div>
      </div>
    </>
  );
}
