<script lang="ts">
  import { onMount, tick } from 'svelte'

  type Role = 'user' | 'assistant'
  type Source = {
    id: string
    title: string
    section: string
    excerpt: string
    url: string
  }
  type Message = {
    role: Role
    content: string
    sources?: Source[]
    found?: boolean
  }
  type DocumentFragment = {
    section: string
    text: string
  }
  type DocumentRecord = {
    id: string
    title: string
    brand: string
    model: string
    config: string
    tier: string
    type: 'ficha' | 'tienda'
    url: string
    fragments: DocumentFragment[]
    fictional: boolean
  }
  type QuestionResponse = {
    answer: string
    sources: Source[]
    found: boolean
  }

  const exampleQuestions = [
    'Quiero un portátil para ofimática, estudiar y videollamadas. Compara las gamas baja, media y alta. Dame una valoración general puntuando cada ordenador.',
    '¿Qué precio tiene cada uno? ¿Merece la pena pagar la diferencia?',
    '¿Dónde puedo comprar los tres portátiles Nova Esencial 15, Atlas Equilibrio 14 y Orbit Studio 16?',
    'Me quedo con el Atlas Equilibrio 14. ¿Cuál es su fecha de fabricación?',
  ]

  let page = $state<'chat' | 'documents' | 'detail'>('chat')
  let messages = $state<Message[]>([])
  let documents = $state<DocumentRecord[]>([])
  let selectedDocument = $state<DocumentRecord | null>(null)
  let draft = $state('')
  let search = $state('')
  let brandFilter = $state('')
  let typeFilter = $state('')
  let isLoading = $state(false)
  let documentsLoading = $state(true)
  let requestError = $state('')
  let documentsError = $state('')
  let transcriptElement = $state<HTMLElement>()

  const filteredDocuments = $derived.by(() => {
    const query = normalize(search.trim())
    return documents.filter((document) => {
      const matchesQuery =
        !query ||
        normalize(
          [
            document.id,
            document.title,
            document.brand,
            document.model,
            document.config,
            document.tier,
            document.type === 'ficha' ? 'ficha técnica' : 'registro de tienda',
            ...document.fragments.flatMap((fragment) => [
              fragment.section,
              fragment.text,
            ]),
          ].join(' '),
        ).includes(query)
      const matchesBrand = !brandFilter || document.brand === brandFilter
      const matchesType = !typeFilter || document.type === typeFilter
      return matchesQuery && matchesBrand && matchesType
    })
  })

  const brands = $derived([...new Set(documents.map((document) => document.brand))])

  onMount(() => {
    void loadDocuments()
  })

  function normalize(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('es')
  }

  function isDocumentFragment(value: unknown): value is DocumentFragment {
    return (
      typeof value === 'object' &&
      value !== null &&
      'section' in value &&
      typeof value.section === 'string' &&
      'text' in value &&
      typeof value.text === 'string'
    )
  }

  function isDocumentRecord(value: unknown): value is DocumentRecord {
    return (
      typeof value === 'object' &&
      value !== null &&
      'id' in value &&
      typeof value.id === 'string' &&
      'title' in value &&
      typeof value.title === 'string' &&
      'brand' in value &&
      typeof value.brand === 'string' &&
      'model' in value &&
      typeof value.model === 'string' &&
      'config' in value &&
      typeof value.config === 'string' &&
      'tier' in value &&
      typeof value.tier === 'string' &&
      'type' in value &&
      (value.type === 'ficha' || value.type === 'tienda') &&
      'url' in value &&
      typeof value.url === 'string' &&
      'fragments' in value &&
      Array.isArray(value.fragments) &&
      value.fragments.every(isDocumentFragment) &&
      'fictional' in value &&
      typeof value.fictional === 'boolean'
    )
  }

  function isSource(value: unknown): value is Source {
    return (
      typeof value === 'object' &&
      value !== null &&
      'id' in value &&
      typeof value.id === 'string' &&
      'title' in value &&
      typeof value.title === 'string' &&
      'section' in value &&
      typeof value.section === 'string' &&
      'excerpt' in value &&
      typeof value.excerpt === 'string' &&
      'url' in value &&
      typeof value.url === 'string'
    )
  }

  function isQuestionResponse(value: unknown): value is QuestionResponse {
    return (
      typeof value === 'object' &&
      value !== null &&
      'answer' in value &&
      typeof value.answer === 'string' &&
      'sources' in value &&
      Array.isArray(value.sources) &&
      value.sources.every(isSource) &&
      'found' in value &&
      typeof value.found === 'boolean'
    )
  }

  function escapeHtml(value: string): string {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;')
  }

  function formatAnswer(value: string): string {
    return escapeHtml(value)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>')
  }

  async function responseError(response: Response): Promise<string> {
    let detail = `Error ${response.status}: no se pudo completar la petición.`
    try {
      const payload: unknown = await response.json()
      if (
        typeof payload === 'object' &&
        payload !== null &&
        'detail' in payload &&
        typeof payload.detail === 'string'
      ) {
        detail = payload.detail
      }
    } catch {
      // Keep the explicit HTTP error when the server did not return JSON.
    }
    return detail
  }

  async function loadDocuments(): Promise<void> {
    documentsLoading = true
    documentsError = ''
    try {
      const response = await fetch('/api/documentos')
      if (!response.ok) {
        throw new Error(await responseError(response))
      }
      const payload: unknown = await response.json()
      if (
        typeof payload !== 'object' ||
        payload === null ||
        !('documentos' in payload) ||
        !Array.isArray(payload.documentos) ||
        !payload.documentos.every(isDocumentRecord)
      ) {
        throw new Error('El servidor devolvió un listado de documentos inválido.')
      }
      documents = payload.documentos
    } catch (error) {
      documentsError =
        error instanceof Error
          ? error.message
          : 'No se pudo cargar el listado de documentos.'
    } finally {
      documentsLoading = false
    }
  }

  async function sendQuestion(question = draft): Promise<void> {
    const content = question.trim()
    if (!content || isLoading) return

    const previousMessages = messages
    messages = [...messages, { role: 'user', content }]
    draft = ''
    requestError = ''
    isLoading = true

    try {
      const response = await fetch('/api/preguntar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: content,
          history: previousMessages.map(({ role, content: messageContent }) => ({
            role,
            content: messageContent,
          })),
        }),
      })
      if (!response.ok) {
        throw new Error(await responseError(response))
      }
      const result: unknown = await response.json()
      if (!isQuestionResponse(result)) {
        throw new Error('El servidor devolvió una respuesta con formato inválido.')
      }
      messages = [
        ...messages,
        {
          role: 'assistant',
          content: result.answer,
          sources: result.sources,
          found: result.found,
        },
      ]
    } catch (error) {
      requestError =
        error instanceof Error
          ? error.message
          : 'No se pudo enviar la pregunta. Comprueba que el servidor está en marcha.'
    } finally {
      isLoading = false
      await tick()
      transcriptElement?.scrollTo({
        top: transcriptElement.scrollHeight,
        behavior: 'smooth',
      })
    }
  }

  function onComposerKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void sendQuestion()
    }
  }

  function openSource(source: Source): void {
    selectedDocument =
      documents.find((document) => document.id === source.id) ?? null
    page = 'detail'
  }

  function clearFilters(): void {
    search = ''
    brandFilter = ''
    typeFilter = ''
  }
</script>

<svelte:head>
  <title>Umbral · Asistente de compra</title>
  <meta
    name="description"
    content="Compara portátiles con respuestas basadas en fuentes y datos de demostración."
  />
</svelte:head>

<div class="app-shell">
  <header class="topbar">
    <a
      class="brand"
      href="#chat"
      aria-label="Umbral, ir al asistente"
      onclick={() => (page = 'chat')}
    >
      <span class="brand-mark" aria-hidden="true">u</span>
      <span>umbral</span>
    </a>
    <span class="top-context">Tu espacio de decisión <span>/</span> Nuevo portátil</span>
    <span class="demo-tag"><span class="status-dot"></span> Demo con datos ficticios</span>
  </header>

  <div class="app-layout">
    <aside class="sidebar" aria-label="Navegación principal">
      <p class="sidebar-label">TU ESPACIO</p>
      <button
        class:active={page === 'chat'}
        class="nav-link"
        type="button"
        onclick={() => (page = 'chat')}
        aria-current={page === 'chat' ? 'page' : undefined}
      >
        <span aria-hidden="true">◉</span> Asistente
      </button>
      <button
        class:active={page === 'documents' || page === 'detail'}
        class="nav-link"
        type="button"
        onclick={() => (page = 'documents')}
        aria-current={page === 'documents' || page === 'detail' ? 'page' : undefined}
      >
        <span aria-hidden="true">▤</span> Fuentes
        <span class="nav-count">{documents.length || '—'}</span>
      </button>

      <div class="sidebar-session">
        <strong>{page === 'documents' ? 'Origen de los datos' : 'Esta conversación'}</strong>
        <p>
          {page === 'documents'
            ? 'Fichas técnicas y registros de tiendas oficiales'
            : 'Un portátil para cada día'}
        </p>
        <span>
          {page === 'documents'
            ? '3 fabricantes ficticios'
            : 'Ofimática · estudio · videollamadas'}
        </span>
      </div>
      <p class="sidebar-note">
        Sin recomendaciones patrocinadas.<br />Los precios y fuentes son de ejemplo.
      </p>
    </aside>

    <main class="main-content">
      {#if page === 'chat'}
        <div class="page-heading">
          <div>
            <p class="eyebrow">ASISTENTE PERSONAL</p>
            <h1>Encontramos tu punto medio.</h1>
            <p>Compara opciones para estudiar, trabajar y llevar contigo.</p>
          </div>
          <span class="soft-tag">{documents.length} fuentes de ejemplo</span>
        </div>

        <div class="chat-layout">
          <section class="chat-column" aria-label="Conversación">
            <div class="transcript" bind:this={transcriptElement} aria-live="polite">
              {#if messages.length === 0}
                <div class="welcome-card">
                  <div class="assistant-avatar" aria-hidden="true">✳</div>
                  <div>
                    <strong>Hola, soy Umbral.</strong>
                    <p>
                      Pregunta por características, precios o canales de compra. Cada
                      respuesta se apoya en las fuentes de ejemplo.
                    </p>
                  </div>
                </div>
                <p class="suggestions-label">PRUEBA UNA PREGUNTA</p>
                <div class="suggestion-list">
                  {#each exampleQuestions as example, index}
                    <button
                      class="suggestion"
                      type="button"
                      disabled={isLoading}
                      onclick={() => void sendQuestion(example)}
                    >
                      <span class="suggestion-number">0{index + 1}</span>
                      <span>{example}</span>
                      <span class="suggestion-arrow" aria-hidden="true">↗</span>
                    </button>
                  {/each}
                </div>
              {:else}
                {#each messages as message, index}
                  {#if message.role === 'user'}
                    <div class="user-message">
                      <span class="message-avatar" aria-hidden="true">Tú</span>
                      <p>{message.content}</p>
                    </div>
                  {:else}
                    <article class="answer-card">
                      <div class="answer-heading">
                        <span class="assistant-avatar" aria-hidden="true">✳</span>
                        <strong>Umbral</strong>
                        <span class="answer-context">· respuesta basada en tus fuentes</span>
                      </div>
                      {#if message.found === false}
                        <div class="unknown-notice" role="status">
                          <span class="unknown-icon" aria-hidden="true">⊘</span>
                          <div>
                            <h2>No consta en los datos.</h2>
                            <p>{message.content}</p>
                          </div>
                        </div>
                      {:else}
                        <p class="answer-text">{@html formatAnswer(message.content)}</p>
                      {/if}

                      {#if message.sources && message.sources.length > 0}
                        <div class="source-heading">
                          <span>FUENTES QUE SUSTENTAN LA RESPUESTA</span>
                          <span>{message.sources.length} citas</span>
                        </div>
                        <div class="source-list">
                          {#each message.sources as source, sourceIndex (`${index}-${source.id}-${source.section}-${sourceIndex}`)}
                            <article class="source-card">
                              <button
                                class="source-open"
                                type="button"
                                onclick={() => openSource(source)}
                                disabled={!documents.some((document) => document.id === source.id)}
                                aria-label={`Abrir fuente ${source.id}, ${source.section}`}
                              >
                                <span class="source-id">[{source.id}]</span>
                                <span class="source-info">
                                  <strong>{source.title}</strong>
                                  <small>§ {source.section}</small>
                                </span>
                                {#if documents.some((document) => document.id === source.id)}
                                  <span class="source-arrow" aria-hidden="true">↗</span>
                                {/if}
                              </button>
                              <blockquote>{source.excerpt}</blockquote>
                            </article>
                          {/each}
                        </div>
                      {/if}
                    </article>
                  {/if}
                {/each}
              {/if}
              {#if isLoading}
                <div class="loading-answer" role="status">
                  <span class="assistant-avatar" aria-hidden="true">✳</span>
                  <span class="loading-dots">Buscando en los documentos…</span>
                </div>
              {/if}
            </div>

            {#if requestError}
              <div class="error-notice" role="alert">
                <strong>No se pudo obtener la respuesta.</strong>
                <span>{requestError}</span>
              </div>
            {/if}

            <form
              class="composer"
              onsubmit={(event) => {
                event.preventDefault()
                void sendQuestion()
              }}
            >
              <label class="visually-hidden" for="question-input">Escribe tu pregunta</label>
              <textarea
                id="question-input"
                bind:value={draft}
                onkeydown={onComposerKeydown}
                placeholder="Pregunta por RAM, precio o fecha de fabricación…"
                maxlength="1000"
                rows="2"
                disabled={isLoading}
              ></textarea>
              <button
                class="send-button"
                type="submit"
                aria-label="Enviar pregunta"
                disabled={isLoading || !draft.trim()}
              >↑</button>
              <div class="composer-footer">
                <span>Enter para enviar · Mayús + Enter para nueva línea</span>
                <span>Las respuestas pueden tardar unos segundos</span>
              </div>
            </form>
            {#if messages.length > 0}
              <button
                class="new-chat-button"
                type="button"
                onclick={() => {
                  messages = []
                  requestError = ''
                }}
              >＋ Empezar una conversación nueva</button>
            {/if}
          </section>

          <aside class="chat-aside">
            <p class="aside-label">TU SELECCIÓN · 3 EQUIPOS</p>
            {#each [
              { brand: 'Nova', model: 'Esencial 15', tier: 'Baja', config: '8 GB · 256 GB · 15,6″', price: '449 €', style: 'low' },
              { brand: 'Atlas', model: 'Equilibrio 14', tier: 'Media', config: '16 GB · 512 GB · 14″', price: '849 €', style: 'medium' },
              { brand: 'Orbit', model: 'Studio 16', tier: 'Alta', config: '32 GB · 1 TB · OLED', price: '1.699 €', style: 'high' },
            ] as product}
              <article class:selected={product.brand === 'Atlas'} class="product-card">
                <span class:tag-green={product.brand === 'Atlas'} class:tag-blue={product.brand === 'Nova'} class:tag-purple={product.brand === 'Orbit'} class="tier-tag">
                  Gama {product.tier.toLowerCase()}
                </span>
                <div class="laptop-art {product.style}" aria-hidden="true">
                  <div class="laptop-screen"></div>
                </div>
                <h2>{product.brand} {product.model}</h2>
                <p>{product.config}</p>
                <div class="product-footer">
                  <strong>{product.price}</strong>
                  <button type="button" onclick={() => (page = 'documents')}>Ver fuentes ↗</button>
                </div>
              </article>
            {/each}
            <div class="aside-disclaimer">
              <strong>Datos de demostración</strong>
              <p>Los precios y fabricantes son ficticios; no representan ofertas reales.</p>
            </div>
          </aside>
        </div>
      {:else if page === 'documents'}
        <div class="page-heading documents-heading">
          <div>
            <p class="eyebrow">BASE DOCUMENTAL</p>
            <h1>Detrás de cada respuesta.</h1>
            <p>Encuentra una fuente, revisa sus fragmentos y comprueba la información.</p>
          </div>
          <button class="secondary-button" type="button" onclick={() => (page = 'chat')}>
            ← Volver al chat
          </button>
        </div>

        <div class="library-stats">
          <span><strong>{documents.length}</strong> documentos</span>
          <span><strong>{brands.length}</strong> fabricantes ficticios</span>
          <span><strong>2</strong> tipos de fuente</span>
        </div>

        <form
          class="search-tools"
          role="search"
          onsubmit={(event) => event.preventDefault()}
        >
          <label class="visually-hidden" for="document-search">Buscar documentos</label>
          <input
            id="document-search"
            bind:value={search}
            type="search"
            placeholder="Buscar por modelo, RAM, puertos, precio…"
          />
          <label class="visually-hidden" for="brand-filter">Filtrar por fabricante</label>
          <select id="brand-filter" bind:value={brandFilter}>
            <option value="">Todos los fabricantes</option>
            {#each brands as brand}
              <option value={brand}>{brand}</option>
            {/each}
          </select>
          <label class="visually-hidden" for="type-filter">Filtrar por tipo</label>
          <select id="type-filter" bind:value={typeFilter}>
            <option value="">Todos los tipos</option>
            <option value="ficha">Ficha técnica</option>
            <option value="tienda">Registro de tienda</option>
          </select>
          <button class="secondary-button" type="button" onclick={clearFilters}>Limpiar</button>
        </form>

        {#if documentsLoading}
          <p class="status-message" role="status">Cargando documentos…</p>
        {:else if documentsError}
          <div class="error-notice" role="alert">
            <strong>No se pudo cargar la biblioteca.</strong>
            <span>{documentsError}</span>
            <button class="secondary-button" type="button" onclick={() => void loadDocuments()}>
              Reintentar
            </button>
          </div>
        {:else}
          <p class="result-count" role="status">
            {filteredDocuments.length}
            {filteredDocuments.length === 1 ? 'documento disponible' : 'documentos disponibles'}
          </p>
          {#if filteredDocuments.length > 0}
            <div class="document-grid">
              {#each filteredDocuments as document}
                <article class="document-card">
                  <div class="document-card-top">
                    <span class="document-icon">{document.type === 'ficha' ? 'TXT' : 'WEB'}</span>
                    <span class="tier-tag" class:tag-blue={document.tier === 'Baja'} class:tag-green={document.tier === 'Media'} class:tag-purple={document.tier === 'Alta'}>
                      Gama {document.tier.toLowerCase()}
                    </span>
                  </div>
                  <h2>{document.title}<br /><span>{document.type === 'ficha' ? 'Ficha técnica' : 'Registro de tienda'}</span></h2>
                  <p><strong>{document.id}</strong> · {document.brand.toLowerCase()}.example</p>
                  <p class="document-summary">
                    {document.fragments.map((fragment) => fragment.section).join(' · ')}
                  </p>
                  <button class="document-link" type="button" onclick={() => {
                    selectedDocument = document
                    page = 'detail'
                  }}>
                    Ver documento <span aria-hidden="true">↗</span>
                  </button>
                </article>
              {/each}
            </div>
          {:else}
            <div class="empty-state">
              <strong>No encontramos documentos con esos filtros.</strong>
              <p>Prueba con otro término o limpia los filtros.</p>
            </div>
          {/if}
        {/if}
      {:else}
        <div class="page-heading">
          <div>
            <p class="eyebrow">FUENTE ORIGINAL DE EJEMPLO</p>
            <h1>{selectedDocument?.title ?? 'Fuente de la respuesta'}</h1>
            <p>
              {#if selectedDocument}
                {selectedDocument.id} · {selectedDocument.type === 'ficha' ? 'Ficha técnica' : 'Registro de tienda'} · Configuración {selectedDocument.config}
              {:else}
                Fragmento citado por el asistente
              {/if}
            </p>
          </div>
          <button class="secondary-button" type="button" onclick={() => (page = 'documents')}>
            ← Biblioteca
          </button>
        </div>

        {#if selectedDocument}
          <div class="detail-layout">
            <article class="document-sheet">
              <div class="document-sheet-heading">
                <span class="document-icon">{selectedDocument.type === 'ficha' ? 'TXT' : 'WEB'}</span>
                <div>
                  <h2>{selectedDocument.type === 'ficha' ? 'Ficha técnica del fabricante' : 'Registro de la tienda oficial'}</h2>
                  <p>{selectedDocument.url} · Documento simulado</p>
                </div>
              </div>
              {#each selectedDocument.fragments as fragment}
                <section class="document-fragment">
                  <h3>{fragment.section}</h3>
                  <p>{fragment.text}</p>
                </section>
              {/each}
            </article>
            <aside class="document-properties">
              <h2>Sobre este documento</h2>
              <dl>
                <div><dt>Identificador</dt><dd>{selectedDocument.id}</dd></div>
                <div><dt>Fabricante ficticio</dt><dd>{selectedDocument.brand}</dd></div>
                <div><dt>Tipo</dt><dd>{selectedDocument.type === 'ficha' ? 'Ficha técnica' : 'Registro de tienda'}</dd></div>
                <div><dt>Gama</dt><dd>{selectedDocument.tier}</dd></div>
                <div><dt>Fabricación</dt><dd>No consta</dd></div>
              </dl>
              <div class="aside-disclaimer">
                <strong>Contenido ficticio</strong>
                <p>No se ha consultado ninguna web real. Los dominios y fragmentos pertenecen a la maqueta.</p>
              </div>
            </aside>
          </div>
        {:else}
          <div class="empty-state">
            <strong>Esta valoración no es un documento de producto.</strong>
            <p>La metodología y las puntuaciones ilustrativas se incluyen en las fuentes citadas como M01.</p>
          </div>
        {/if}
      {/if}
    </main>
  </div>

  <footer class="app-footer">
    <span><strong>umbral</strong> · Elegir mejor empieza por preguntar mejor.</span>
    <span>Las fuentes y los productos son datos ficticios de demostración.</span>
  </footer>
</div>
