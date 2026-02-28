export const designSystemConfig = {
  mode: 'primary' as const,
  description: 'Edits Tailwind CSS design tokens in workspace styles',
  permission: {
    // Litho tools — allowed
    readMainCss: 'allow',
    writeMainCss: 'allow',
    editMainCss: 'allow',
    // Litho tools — denied (document only)
    listPages: 'deny',
    readPage: 'deny',
    writePage: 'deny',
    editPage: 'deny',
    createPage: 'deny',
    deletePage: 'deny',
    updatePageDescription: 'deny',
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
