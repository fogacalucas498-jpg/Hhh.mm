import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import "./landing.css";

const Logo = () => (
  <svg viewBox="0 0 160 40" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ height: 32, display: "block" }}>
    <rect width="36" height="36" x="2" y="2" rx="10" fill="url(#llg)" />
    <circle cx="14" cy="15" r="2.5" fill="white" />
    <circle cx="26" cy="15" r="2.5" fill="white" />
    <rect x="11" y="22" width="18" height="3" rx="1.5" fill="white" />
    <rect x="8" y="10" width="24" height="18" rx="5" stroke="white" strokeWidth="2" fill="none" />
    <rect x="17" y="6" width="6" height="4" rx="1" fill="white" />
    <rect x="4" y="18" width="3" height="6" rx="1.5" fill="white" />
    <rect x="33" y="18" width="3" height="6" rx="1.5" fill="white" />
    <text x="46" y="26" fontFamily="Inter,-apple-system,sans-serif" fontSize="20" fontWeight="800" fill="white" letterSpacing="-0.5">Bot</text>
    <text x="80" y="26" fontFamily="Inter,-apple-system,sans-serif" fontSize="20" fontWeight="800" fill="#25d366" letterSpacing="-0.5">.io</text>
    <defs>
      <linearGradient id="llg" x1="2" y1="2" x2="38" y2="38" gradientUnits="userSpaceOnUse">
        <stop stopColor="#25d366" /><stop offset="1" stopColor="#1da851" />
      </linearGradient>
    </defs>
  </svg>
);

const MARQUEE_ITEMS = [
  "🤖 Múltiplos Agentes","⚡ IA Powered","☁️ 100% Cloud","📊 Relatórios Precisos",
  "🔒 Segurança LGPD","📁 Base de Conhecimento","🎙️ Transcreve Áudios","📱 Múltiplos Números",
  "⏰ Economize Tempo","👥 Controle os Leads","🔧 Fácil Configuração","💳 Sem Fidelidade",
];

export default function LandingPage() {
  const [, navigate] = useLocation();
  const [navOpen, setNavOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [activeTab, setActiveTab] = useState("construa");
  const [quarterly, setQuarterly] = useState(false);
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const goTo = (href: string) => {
    setNavOpen(false);
    if (href.startsWith("#")) {
      const el = document.querySelector(href);
      if (el) el.scrollIntoView({ behavior: "smooth" });
    } else {
      navigate(href);
    }
  };

  const TABS = [
    {
      id: "construa", label: "🔨 Construa",
      title: "Faça Uma Vez e Observe",
      text: "Crie e treine um agente de I.A com o conhecimento do seu produto, defina as regras de comportamento e conecte ao seu WhatsApp. Depois, é só acompanhar os resultados.",
      items: ["Editor visual de agentes","Upload de PDFs e documentos","Base de conhecimento ilimitada","Personalidade e tom configuráveis"],
      visual: (
        <div className="visual-card">
          <div className="agent-preview">
            <div className="agent-avatar">🤖</div>
            <div><div className="agent-name">Agente Vendas Pro</div><div className="agent-model">GPT-4o · Ativo</div></div>
            <div className="agent-status-dot" />
          </div>
          <div className="training-items">
            <div className="training-item">📄 Manual do Produto.pdf</div>
            <div className="training-item">🌐 www.meusite.com.br</div>
            <div className="training-item">❓ Perguntas Frequentes</div>
          </div>
        </div>
      ),
    },
    {
      id: "resolva", label: "✅ Resolva",
      title: "Resolva Dúvidas em Segundos",
      text: "Seu agente responde perguntas frequentes, preços, prazos e detalhes do produto automaticamente — 24h por dia, 7 dias por semana, sem intervenção humana.",
      items: ["Respostas instantâneas 24/7","Entendimento de contexto avançado","Suporte a múltiplos idiomas","Histórico de conversas completo"],
      visual: (
        <div className="visual-card">
          <div className="mockup-chat" style={{ gap: 10 }}>
            <div className="chat-msg in">Qual o prazo de entrega?</div>
            <div className="chat-msg out">Entregamos em até 5 dias úteis para todo o Brasil! 🚚</div>
            <div className="chat-msg in">Tem parcelamento?</div>
            <div className="chat-msg out">Sim! Parcelamos em até 12x sem juros no cartão 💳</div>
          </div>
        </div>
      ),
    },
    {
      id: "otimize", label: "⚡ Otimize",
      title: "Métricas que Geram Resultado",
      text: "Acompanhe em tempo real o desempenho dos seus agentes, volume de atendimentos e leads capturados — tudo em dashboards claros e acionáveis.",
      items: ["Dashboard em tempo real","Taxa de resolução automática","Leads capturados por agente","Relatórios exportáveis em CSV"],
      visual: (
        <div className="visual-card">
          {[["Mensagens Hoje","1.247","↑ 23%"],["Taxa de Resolução","98.2%","↑ 4%"],["Leads Capturados","89","↑ 12%"]].map(([label, val, delta]) => (
            <div key={label} className="mockup-stat" style={{ padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
              <span>{label}</span>
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <strong style={{ color: "#fff", fontWeight: 700 }}>{val}</strong>
                <span style={{ fontSize: "0.75rem", color: "#25d366" }}>{delta}</span>
              </span>
            </div>
          ))}
        </div>
      ),
    },
    {
      id: "transfira", label: "🤝 Transfira",
      title: "Humano Quando Precisar",
      text: "Quando o cliente precisar de atendimento especializado, o agente transfere automaticamente com todo o contexto da conversa — sem o cliente precisar repetir nada.",
      items: ["Transferência com contexto completo","Notificação instantânea ao atendente","Retomada automática pelo bot","Histórico unificado da conversa"],
      visual: (
        <div className="visual-card">
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div className="chat-msg in" style={{ maxWidth: "100%" }}>Preciso falar com um atendente</div>
            <div className="chat-msg out" style={{ maxWidth: "100%" }}>Claro! Transferindo você agora... 🤝</div>
            <div style={{ background: "rgba(37,211,102,0.1)", border: "1px solid rgba(37,211,102,0.25)", borderRadius: 8, padding: "10px 14px", fontSize: "0.82rem", color: "#25d366" }}>
              ✓ Atendente Ana conectada — contexto enviado automaticamente
            </div>
          </div>
        </div>
      ),
    },
  ];

  const PRICES = { Start: { m: 97, q: 77 }, Pro: { m: 267, q: 213 }, Ultra: { m: 697, q: 557 } };

  return (
    <div className="lp">
      {/* NAVBAR */}
      <nav className={`navbar${scrolled ? " scrolled" : ""}`} ref={navRef} style={{ position: "relative" }}>
        <div className="nav-container">
          <a href="#home" className="nav-logo" onClick={e => { e.preventDefault(); goTo("#home"); }}><Logo /></a>
          <ul className={`nav-links${navOpen ? " open" : ""}`}>
            {[["#features","Funcionalidades"],["#como-funciona","Como Funciona"],["#pricing","Preços"]].map(([h,l]) => (
              <li key={h}><a href={h} onClick={e => { e.preventDefault(); goTo(h); }}>{l}</a></li>
            ))}
          </ul>
          <div className="nav-actions">
            <button className="btn-ghost" onClick={() => navigate("/login")}>Acessar</button>
            <button className="btn-primary" onClick={() => navigate("/login")}>Começar Grátis</button>
          </div>
          <button className="nav-mobile-toggle" onClick={() => setNavOpen(v => !v)}>☰</button>
        </div>
      </nav>

      {/* HERO */}
      <section className="hero" id="home">
        <div className="hero-bg" />
        <div className="hero-container">
          <div className="hero-badge">
            <span className="badge-dot" />
            Plataforma de Atendimento com I.A
          </div>
          <h1 className="hero-title">
            Transforme seu WhatsApp<br />
            com <span className="text-gradient">Inteligência Artificial</span>
          </h1>
          <p className="hero-subtitle">
            Com o <strong>Bot.io</strong>, crie agentes de I.A treinados com o conhecimento do seu negócio
            e atenda clientes no WhatsApp de forma automática, natural e eficiente. Sem código, sem complicação.
          </p>
          <div className="hero-actions">
            <button className="btn-primary btn-large" onClick={() => navigate("/login")}>
              Cadastre-se Grátis
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </button>
            <span className="hero-note">Sem cartão de crédito · Comece em 2 minutos</span>
          </div>

          {/* Mockup */}
          <div className="hero-mockup">
            <div className="mockup-topbar">
              <span className="dot red" /><span className="dot yellow" /><span className="dot green" />
              <span className="mockup-url">app.bot.io/dashboard</span>
            </div>
            <div className="mockup-screen">
              <div className="mockup-sidebar">
                {[["🤖 Agentes",true],["📱 Dispositivos",false],["💬 Conversas",false],["📊 Relatórios",false]].map(([label, active]) => (
                  <div key={String(label)} className={`mockup-nav-item${active ? " active" : ""}`}>{String(label)}</div>
                ))}
              </div>
              <div className="mockup-content">
                <div className="mockup-card">
                  <div className="mockup-card-header">
                    <div className="mockup-avatar green" />
                    <div><div className="mockup-name">Agente Vendas</div><div className="mockup-status">● Online</div></div>
                  </div>
                  <div className="mockup-stat"><span>Mensagens hoje</span><strong>1.247</strong></div>
                  <div className="mockup-stat"><span>Taxa de resposta</span><strong>98.2%</strong></div>
                </div>
                <div className="mockup-chat">
                  <div className="chat-msg in">Olá! Queria saber mais sobre o produto 😊</div>
                  <div className="chat-msg out">Claro! Fico feliz em ajudar. Qual é sua principal dúvida?</div>
                  <div className="chat-msg in">Qual o prazo de entrega?</div>
                  <div className="chat-typing"><span /><span /><span /></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* MARQUEE */}
      <section className="marquee-section">
        <div className="marquee-track">
          <div className="marquee-inner">
            {[...MARQUEE_ITEMS, ...MARQUEE_ITEMS].map((item, i) => (
              <span key={i}>{item}</span>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="features" id="features">
        <div className="container">
          <div className="section-tag">Perfeita Para Qualquer Negócio</div>
          <h2>A Plataforma completa<br />para agentes de I.A</h2>
          <p className="section-subtitle">O Bot.io é uma plataforma focada na construção de agentes de I.A que resolvem as dores do seu cliente e aumentam seus lucros.</p>
          <div className="features-grid">
            <div className="feature-card feature-card--highlight">
              <div className="feature-icon">🚀</div>
              <h3>Impulsione Satisfação e Fidelidade</h3>
              <p>Com o nosso construtor de agentes, sua única preocupação é fornecer a base de conhecimento e conectar seu WhatsApp. A I.A faz o resto.</p>
              <div className="feature-preview">
                <div className="preview-line" /><div className="preview-line short" /><div className="preview-line medium" />
              </div>
            </div>
            {[
              ["🎛️","Controle que Reflete Excelência","Administre o conteúdo ensinado ao seu agente com o nosso editor poderoso e extremamente simples de usar."],
              ["📚","Embarque Conhecimento de Forma Simples","PDFs, sites, instruções ou perguntas frequentes — diversas formas de alimentar o conhecimento da sua empresa para o agente."],
              ["🎙️","Entende e Responde em Áudio","Seus clientes mandam áudio? O Bot.io transcreve, entende e pode responder também em áudio com voz natural."],
              ["📊","Dashboards e Relatórios em Tempo Real","Acompanhe conversas, leads capturados e desempenho dos agentes com métricas claras e acionáveis."],
              ["🔁","Transferência para Humano","Quando o cliente precisar de um atendente humano, o agente transfere automaticamente com todo o contexto da conversa."],
            ].map(([icon, title, desc]) => (
              <div className="feature-card" key={String(title)}>
                <div className="feature-icon">{icon}</div>
                <h3>{title}</h3>
                <p>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="how-it-works" id="como-funciona">
        <div className="container">
          <div className="section-tag">Simples do início ao fim</div>
          <h2>Como o Bot.io Funciona</h2>
          <p className="section-subtitle">Três passos para ter seu agente de I.A atendendo clientes no WhatsApp.</p>
          <div className="steps-grid">
            {[
              ["01","🤖","Treine seu Agente","Crie um agente e treine com instruções, documentos, perguntas frequentes e mais. 100% personalizado para o seu negócio."],
              ["02","📱","Conecte o WhatsApp","Escaneie o QR Code para conectar seu número. Sem instalar nada no celular, 100% na nuvem."],
              ["03","📈","Veja os Resultados","Seu agente começa a atender. Monitore conversas, intervenha quando quiser e escale sem limite."],
            ].map(([num, icon, title, desc]) => (
              <div className="step-card" key={num}>
                <div className="step-number">{num}</div>
                <div className="step-icon-wrap" style={{ fontSize: "2.2rem" }}>{icon}</div>
                <h3>{title}</h3>
                <p>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* BENEFITS */}
      <section className="benefits" id="beneficios">
        <div className="container">
          <div className="section-tag">Benefícios</div>
          <h2>Desbloqueie o Potencial Total</h2>
          <p className="section-subtitle">Viva a experiência completa que um agente de I.A super treinado pode oferecer para sua equipe e clientes.</p>
          <div className="benefits-tabs">
            {TABS.map(t => (
              <button key={t.id} className={`tab-btn${activeTab === t.id ? " active" : ""}`} onClick={() => setActiveTab(t.id)}>
                {t.label}
              </button>
            ))}
          </div>
          <div className="benefits-content">
            {TABS.map(t => (
              <div key={t.id} className={`tab-panel${activeTab === t.id ? " active" : ""}`}>
                <div className="benefit-layout">
                  <div className="benefit-text">
                    <h3>{t.title}</h3>
                    <p>{t.text}</p>
                    <ul className="benefit-list">
                      {t.items.map(item => <li key={item}>✓ {item}</li>)}
                    </ul>
                  </div>
                  <div className="benefit-visual">{t.visual}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section className="pricing" id="pricing">
        <div className="container">
          <div className="section-tag">Planos simples, sem surpresas</div>
          <h2>Comece Pequeno, Escale Muito</h2>
          <p className="section-subtitle">Com o Bot.io, você já pode começar a vender de forma automatizada com I.A no seu WhatsApp, e se precisar, escale a qualquer momento.</p>
          <div className="pricing-toggle">
            <span>Mensal</span>
            <label className="toggle-switch">
              <input type="checkbox" checked={quarterly} onChange={e => setQuarterly(e.target.checked)} />
              <span className="toggle-slider" />
            </label>
            <span>Trimestral <span className="badge-discount">20% OFF</span></span>
          </div>
          <div className="pricing-grid">
            {/* Start */}
            <div className="pricing-card">
              <div className="plan-name">Start</div>
              <div className="plan-tagline">Ideal para demandas menores</div>
              <div className="plan-price">
                <span className="price-currency">R$</span>
                <span className="price-amount">{quarterly ? PRICES.Start.q : PRICES.Start.m}</span>
                <span className="price-period">/mês</span>
              </div>
              <button className="btn-outline-full" onClick={() => navigate("/login")}>Começar Agora</button>
              <ul className="plan-features">
                {["1.000 mensagens / mês","1 dispositivo / número","Bot completo com I.A","Suporte padrão"].map(f => <li key={f}>✓ {f}</li>)}
              </ul>
            </div>
            {/* Pro */}
            <div className="pricing-card pricing-card--featured">
              <div className="plan-badge">Mais Popular</div>
              <div className="plan-name">Pro</div>
              <div className="plan-tagline">Ideal para demandas maiores</div>
              <div className="plan-price">
                <span className="price-currency">R$</span>
                <span className="price-amount">{quarterly ? PRICES.Pro.q : PRICES.Pro.m}</span>
                <span className="price-period">/mês</span>
              </div>
              <button className="btn-primary-full" onClick={() => navigate("/login")}>Começar Agora</button>
              <ul className="plan-features">
                {["Mensagens ilimitadas","1 dispositivo / número","Bot escuta áudios","Suporte padrão","Transferência para humano"].map(f => <li key={f}>✓ {f}</li>)}
              </ul>
            </div>
            {/* Ultra */}
            <div className="pricing-card">
              <div className="plan-name">Ultra</div>
              <div className="plan-tagline">Para demandas muito grandes</div>
              <div className="plan-price">
                <span className="price-currency">R$</span>
                <span className="price-amount">{quarterly ? PRICES.Ultra.q : PRICES.Ultra.m}</span>
                <span className="price-period">/mês</span>
              </div>
              <button className="btn-outline-full" onClick={() => navigate("/login")}>Começar Agora</button>
              <ul className="plan-features">
                {["Mensagens ilimitadas","2 dispositivos / números","Escuta e envia áudios","Suporte Premium","Agentes ilimitados","Broadcasts em massa"].map(f => <li key={f}>✓ {f}</li>)}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="faq" id="faq">
        <div className="faq-container">
          <div style={{ textAlign: "center" }}>
            <div className="section-tag">Sem deixar dúvidas</div>
            <h2>Perguntas Frequentes</h2>
          </div>
          <div className="faq-list">
            {[
              ["Como é feita a segurança dos dados?","Seus dados e chaves de API jamais serão utilizados para treinar novos modelos. Seguimos rigorosamente a LGPD. Todo o tráfego é criptografado com TLS/HTTPS."],
              ["É possível o robô executar ações?","Sim! Via webhooks, o Bot.io pode acionar sistemas externos, atualizar CRMs, enviar notificações e muito mais sempre que uma condição for atingida na conversa."],
              ["Com quais documentos posso treinar meu agente?","PDFs, textos, URLs de sites, perguntas e respostas manuais, e em breve integração com Notion e Google Docs."],
              ["Meu WhatsApp pode ser banido?","O Bot.io usa comportamento humanizado com delays variáveis para simular digitação real. Ainda assim, recomendamos usar números dedicados ao bot, não seu número pessoal."],
              ["Posso testar antes de pagar?","Sim! Oferecemos acesso gratuito para você testar a plataforma antes de assinar qualquer plano. Sem cartão de crédito necessário."],
            ].map(([q, a]) => (
              <details className="faq-item" key={q}>
                <summary>{q}</summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA FINAL */}
      <section className="cta-final">
        <div className="container">
          <div className="cta-card">
            <div className="cta-glow" />
            <div className="section-tag">Para Negócios que Querem Crescer</div>
            <h2>Transforme seu WhatsApp com I.A!</h2>
            <p>Faça parte dos negócios que estão transformando o atendimento no WhatsApp com inteligência artificial e inicie agora mesmo!</p>
            <button className="btn-primary btn-large" onClick={() => navigate("/login")}>Começar Grátis Agora</button>
            <p className="cta-note">Sem cartão de crédito · Cancele quando quiser</p>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="footer">
        <div className="container">
          <div className="footer-top">
            <div className="footer-brand">
              <Logo />
              <p style={{ marginTop: 12 }}>Atendimento inteligente no WhatsApp com I.A. Simples, eficiente e poderoso.</p>
            </div>
            <div className="footer-links">
              <div className="footer-col">
                <h4>Produto</h4>
                <a href="#features" onClick={e => { e.preventDefault(); goTo("#features"); }}>Funcionalidades</a>
                <a href="#pricing" onClick={e => { e.preventDefault(); goTo("#pricing"); }}>Preços</a>
                <a href="/login" onClick={e => { e.preventDefault(); navigate("/login"); }}>Acessar</a>
              </div>
              <div className="footer-col">
                <h4>Legal</h4>
                <a href="#">Termos de Uso</a>
                <a href="#">Privacidade</a>
              </div>
            </div>
          </div>
          <div className="footer-bottom">
            <p>Bot.io © 2026 · Todos os Direitos Reservados.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
