export const designSystemConfig = {
  mode: 'primary' as const,
  description: 'Edits Tailwind CSS design tokens in workspace styles',
  permission: {
    // Litho tools — allowed
    readMainCss: 'allow',
    writeMainCss: 'allow',
    editMainCss: 'allow',
    // Litho tools — page tools for design system document
    listPages: 'allow',
    readPage: 'allow',
    writePage: 'allow',
    editPage: 'allow',
    createPage: 'allow',
    deletePage: 'allow',
    updatePageDescription: 'allow',
    // OpenCode built-in tools — all denied
    read: 'deny',
    edit: 'deny',
    write: 'deny',
    apply_patch: 'deny',
    glob: 'deny',
    grep: 'deny',
    list: 'deny',
    bash: 'deny',
    task: 'deny',
    todowrite: 'deny',
    webfetch: 'deny',
    websearch: 'deny',
    codesearch: 'deny',
    skill: 'deny',
  } as const,
};
