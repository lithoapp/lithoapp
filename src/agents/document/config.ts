export const documentConfig = {
  mode: 'primary' as const,
  description: 'Helps build and edit Litho document pages',
  permission: {
    // Litho tools — allowed
    listPages: 'allow',
    readPage: 'allow',
    writePage: 'allow',
    editPage: 'allow',
    readMainCss: 'allow',
    createPage: 'allow',
    deletePage: 'allow',
    updatePageDetails: 'allow',
    movePage: 'allow',
    // Litho tools — denied (design-system only)
    writeMainCss: 'deny',
    editMainCss: 'deny',
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
