import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, gql } from '@apollo/client'
import {
  Loader2,
  Plus,
  Trash2,
  FileText,
  Check,
  ExternalLink,
  Paperclip,
  Upload,
  Download,
  File,
  Image,
  Eye,
  Link2,
  Scan,
  X,
} from 'lucide-react'
import { cn, formatDateTime } from '@/lib/utils'
import { getToken } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { FileDropZone } from '@/components/FileDropZone'
import { PdfAnalysisPanel } from './PdfAnalysisPanel'

export interface Attachment {
  id: string
  originalFilename: string
  fileSize: number
  contentType: string
  description: string
  category: string
  uploadedAt: string
  uploadedByName: string | null
  downloadUrl: string
}

export interface ContractLink {
  id: string
  name: string
  url: string
  createdAt: string
  createdByName: string | null
}

const UPLOAD_ATTACHMENT_MUTATION = gql`
  mutation UploadContractAttachment($input: UploadAttachmentInput!) {
    uploadContractAttachment(input: $input) {
      success
      error
      attachment {
        id
        originalFilename
        fileSize
        contentType
        description
        category
        uploadedAt
        uploadedByName
        downloadUrl
      }
    }
  }
`

const DELETE_ATTACHMENT_MUTATION = gql`
  mutation DeleteContractAttachment($attachmentId: ID!) {
    deleteContractAttachment(attachmentId: $attachmentId) {
      success
      error
    }
  }
`

const UPDATE_ATTACHMENT_META_MUTATION = gql`
  mutation UpdateContractAttachmentMeta($input: UpdateAttachmentMetaInput!) {
    updateContractAttachmentMeta(input: $input) {
      success
      error
      attachment {
        id
        originalFilename
        fileSize
        contentType
        description
        category
        uploadedAt
        uploadedByName
        downloadUrl
      }
    }
  }
`

const ADD_CONTRACT_LINK_MUTATION = gql`
  mutation AddContractLink($input: AddContractLinkInput!) {
    addContractLink(input: $input) {
      success
      error
      link {
        id
        name
        url
        createdAt
        createdByName
      }
    }
  }
`

const DELETE_CONTRACT_LINK_MUTATION = gql`
  mutation DeleteContractLink($linkId: ID!) {
    deleteContractLink(linkId: $linkId) {
      success
      error
    }
  }
`

export function AttachmentsTab({
  contractId,
  attachments,
  links,
  canEdit,
  onRefetch,
}: {
  contractId: string
  attachments: Attachment[]
  links: ContractLink[]
  canEdit: boolean
  onRefetch: () => void
}) {
  const { t } = useTranslation()
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [showAddLink, setShowAddLink] = useState(false)
  const [linkName, setLinkName] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const [addingLink, setAddingLink] = useState(false)

  const [analyzingAttachmentId, setAnalyzingAttachmentId] = useState<string | null>(null)
  const [uploadCategory, setUploadCategory] = useState('')
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [editNoteValue, setEditNoteValue] = useState('')

  const [uploadAttachment] = useMutation(UPLOAD_ATTACHMENT_MUTATION)
  const [deleteAttachment] = useMutation(DELETE_ATTACHMENT_MUTATION)
  const [updateAttachmentMeta] = useMutation(UPDATE_ATTACHMENT_META_MUTATION)
  const [addLink] = useMutation(ADD_CONTRACT_LINK_MUTATION, { context: { suppressErrorToast: true } })
  const [deleteLink] = useMutation(DELETE_CONTRACT_LINK_MUTATION)

  const ATTACHMENT_CATEGORIES = [
    { value: 'order', label: t('attachments.categoryOrder') },
    { value: 'contract', label: t('attachments.categoryContract') },
    { value: 'offer', label: t('attachments.categoryOffer') },
    { value: 'other', label: t('attachments.categoryOther') },
  ]

  const getCategoryLabel = (category: string) => {
    if (category === 'order_confirmation') return t('attachments.categoryOrderConfirmation', 'Auftragsbestätigung')
    const cat = ATTACHMENT_CATEGORIES.find((c) => c.value === category)
    return cat ? cat.label : ''
  }

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'order': return 'bg-blue-100 text-blue-800'
      case 'contract': return 'bg-green-100 text-green-800'
      case 'offer': return 'bg-amber-100 text-amber-800'
      case 'order_confirmation': return 'bg-purple-100 text-purple-800'
      case 'other': return 'bg-gray-100 text-gray-800'
      default: return ''
    }
  }

  const handleUpdateCategory = async (attachmentId: string, category: string) => {
    try {
      await updateAttachmentMeta({
        variables: { input: { attachmentId, category } },
      })
      onRefetch()
    } catch (err) {
      console.error('Failed to update category:', err)
    }
  }

  const handleSaveNote = async (attachmentId: string) => {
    try {
      await updateAttachmentMeta({
        variables: { input: { attachmentId, description: editNoteValue } },
      })
      setEditingNoteId(null)
      onRefetch()
    } catch (err) {
      console.error('Failed to update note:', err)
    }
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const getFileIcon = (contentType: string) => {
    if (contentType.startsWith('image/')) return <Image className="h-5 w-5" />
    if (contentType === 'application/pdf') return <FileText className="h-5 w-5" />
    return <File className="h-5 w-5" />
  }

  const readFileAsBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        const base64 = (e.target?.result as string)?.split(',')[1]
        if (base64) resolve(base64)
        else reject(new Error('read failed'))
      }
      reader.onerror = () => reject(new Error('read failed'))
      reader.readAsDataURL(file)
    })
  }

  const uploadFiles = async (files: File[]) => {
    if (files.length === 0) return

    setError(null)
    setUploading(true)

    const errors: string[] = []
    for (const file of files) {
      try {
        const base64 = await readFileAsBase64(file)
        const result = await uploadAttachment({
          variables: {
            input: {
              contractId,
              fileContent: base64,
              filename: file.name,
              contentType: file.type || 'application/octet-stream',
              description: '',
              category: uploadCategory,
            },
          },
        })
        if (!result.data?.uploadContractAttachment?.success) {
          errors.push(`${file.name}: ${result.data?.uploadContractAttachment?.error || t('attachments.uploadFailed')}`)
        }
      } catch (err) {
        errors.push(`${file.name}: ${t('attachments.uploadFailed')}`)
      }
    }

    if (errors.length > 0) {
      setError(errors.join('\n'))
    }
    if (errors.length < files.length) {
      setUploadCategory('')
      onRefetch()
    }
    setUploading(false)
  }

  const handleDelete = async (attachment: Attachment) => {
    if (!confirm(t('attachments.confirmDelete', { filename: attachment.originalFilename }))) {
      return
    }

    try {
      const result = await deleteAttachment({
        variables: { attachmentId: attachment.id },
      })

      if (result.data?.deleteContractAttachment?.success) {
        onRefetch()
      }
    } catch (err) {
      console.error('Failed to delete attachment:', err)
    }
  }

  const fetchWithAuth = async (url: string): Promise<Blob | null> => {
    const token = getToken()
    try {
      const response = await fetch(url, {
        headers: {
          Authorization: token ? `Bearer ${token}` : '',
        },
      })
      if (!response.ok) {
        console.error('Failed to fetch file:', response.statusText)
        return null
      }
      return await response.blob()
    } catch (err) {
      console.error('Failed to fetch file:', err)
      return null
    }
  }

  const handleDownload = async (attachment: Attachment) => {
    const blob = await fetchWithAuth(attachment.downloadUrl)
    if (!blob) return

    // Create download link
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = attachment.originalFilename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const isPreviewable = (contentType: string) => {
    // Files that can be previewed in browser
    return (
      contentType.startsWith('image/') ||
      contentType === 'application/pdf' ||
      contentType.startsWith('text/')
    )
  }

  const handlePreview = async (attachment: Attachment) => {
    const blob = await fetchWithAuth(attachment.downloadUrl)
    if (!blob) return

    // Create blob URL with correct content type and open in new tab
    const blobWithType = new Blob([blob], { type: attachment.contentType })
    const url = URL.createObjectURL(blobWithType)
    window.open(url, '_blank')
  }

  const handleAddLink = async () => {
    if (!linkName.trim() || !linkUrl.trim()) return

    // Basic URL validation
    try {
      new URL(linkUrl)
    } catch {
      setError(t('links.invalidUrl'))
      return
    }

    setAddingLink(true)
    setError(null)

    try {
      const result = await addLink({
        variables: {
          input: {
            contractId,
            name: linkName.trim(),
            url: linkUrl.trim(),
          },
        },
      })

      if (result.data?.addContractLink?.success) {
        setLinkName('')
        setLinkUrl('')
        setShowAddLink(false)
        onRefetch()
      } else {
        setError(result.data?.addContractLink?.error || t('links.addFailed'))
      }
    } catch (err) {
      setError(t('links.addFailed'))
    } finally {
      setAddingLink(false)
    }
  }

  const handleDeleteLink = async (link: ContractLink) => {
    if (!confirm(t('links.confirmDelete', { name: link.name }))) {
      return
    }

    try {
      const result = await deleteLink({
        variables: { linkId: link.id },
      })

      if (result.data?.deleteContractLink?.success) {
        onRefetch()
      }
    } catch (err) {
      console.error('Failed to delete link:', err)
    }
  }

  const handleCopyPermalink = async (attachmentId: string) => {
    const url = `${window.location.origin}/attachments/${attachmentId}/`
    await navigator.clipboard.writeText(url)
    setCopiedId(attachmentId)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const handleCopySectionLink = async () => {
    const url = `${window.location.origin}/contracts/${contractId}#attachments`
    await navigator.clipboard.writeText(url)
    setCopiedId('section')
    setTimeout(() => setCopiedId(null), 2000)
  }

  return (
    <div>
      {/* Header with section link and upload */}
      <div className="mb-4 flex items-center justify-between">
        <button
          onClick={handleCopySectionLink}
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
          title={copiedId === 'section' ? t('attachments.linkCopied') : t('attachments.sectionLink')}
        >
          {copiedId === 'section' ? (
            <>
              <Check className="h-4 w-4 text-green-500" />
              <span className="text-green-600">{t('attachments.linkCopied')}</span>
            </>
          ) : (
            <>
              <Link2 className="h-4 w-4" />
              <span>{t('attachments.sectionLink')}</span>
            </>
          )}
        </button>
        {canEdit && (
          <div className="flex items-center gap-3">
            <Select value={uploadCategory || '__none__'} onValueChange={(v) => setUploadCategory(v === '__none__' ? '' : v)}>
              <SelectTrigger className="w-[160px] h-9">
                <SelectValue placeholder={t('attachments.category')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">{t('attachments.noCategory')}</SelectItem>
                {ATTACHMENT_CATEGORIES.map((cat) => (
                  <SelectItem key={cat.value} value={cat.value}>
                    {cat.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FileDropZone
              onFilesSelected={uploadFiles}
              disabled={uploading}
              multiple
              className="inline-block rounded-md"
            >
              <span className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
                {uploading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t('attachments.uploading')}
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4" />
                    {t('attachments.uploadFile')}
                  </>
                )}
              </span>
            </FileDropZone>
          </div>
        )}
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Attachments List */}
      {attachments.length === 0 ? (
        canEdit ? (
          <FileDropZone
            onFilesSelected={uploadFiles}
            disabled={uploading}
            multiple
            className="rounded-lg border-2 border-dashed bg-white p-8 text-center"
            activeContent={
              <>
                <Upload className="mx-auto h-12 w-12 text-blue-500" />
                <p className="mt-2 text-blue-600 font-medium">{t('attachments.dropHere')}</p>
              </>
            }
          >
            <Paperclip className="mx-auto h-12 w-12 text-gray-400" />
            <p className="mt-2 text-gray-600">{t('attachments.noAttachments')}</p>
            <p className="mt-1 text-sm text-gray-400">{t('attachments.dropHint')}</p>
          </FileDropZone>
        ) : (
          <div className="rounded-lg border bg-white p-8 text-center">
            <Paperclip className="mx-auto h-12 w-12 text-gray-400" />
            <p className="mt-2 text-gray-600">{t('attachments.noAttachments')}</p>
          </div>
        )
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  {t('attachments.filename')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  {t('attachments.category')}
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                  {t('attachments.size')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  {t('attachments.uploadedBy')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  {t('attachments.uploadedAt')}
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                  {/* Actions */}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {attachments.map((attachment) => {
                // Synthetic attachments (e.g. order confirmation PDFs) have negative IDs
                // — no edit/delete/permalink/analyze actions; only download + preview.
                const isSynthetic = Number(attachment.id) < 0
                return (
                <tr key={attachment.id}>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      {getFileIcon(attachment.contentType)}
                      <span className="font-medium text-gray-900">
                        {attachment.originalFilename}
                      </span>
                    </div>
                    {!isSynthetic && editingNoteId === attachment.id ? (
                      <div className="mt-1 flex items-center gap-1">
                        <Input
                          value={editNoteValue}
                          onChange={(e) => setEditNoteValue(e.target.value)}
                          placeholder={t('attachments.notePlaceholder')}
                          className="h-7 text-xs"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveNote(attachment.id)
                            if (e.key === 'Escape') setEditingNoteId(null)
                          }}
                          autoFocus
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2"
                          onClick={() => handleSaveNote(attachment.id)}
                        >
                          <Check className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2"
                          onClick={() => setEditingNoteId(null)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : (
                      <p
                        className={cn(
                          "mt-1 text-xs",
                          attachment.description ? "text-gray-500" : "text-gray-300 italic",
                          canEdit && !isSynthetic && "cursor-pointer hover:text-blue-600"
                        )}
                        onClick={() => {
                          if (!canEdit || isSynthetic) return
                          setEditingNoteId(attachment.id)
                          setEditNoteValue(attachment.description)
                        }}
                      >
                        {attachment.description || (canEdit && !isSynthetic ? t('attachments.notePlaceholder') : '')}
                      </p>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm">
                    {canEdit && !isSynthetic ? (
                      <Select
                        value={attachment.category || '__none__'}
                        onValueChange={(value) => handleUpdateCategory(attachment.id, value === '__none__' ? '' : value)}
                      >
                        <SelectTrigger className="h-7 w-[130px] text-xs border-0 bg-transparent hover:bg-gray-100 focus:ring-0">
                          <SelectValue>
                            {attachment.category ? (
                              <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', getCategoryColor(attachment.category))}>
                                {getCategoryLabel(attachment.category)}
                              </span>
                            ) : (
                              <span className="text-gray-300 italic">{t('attachments.noCategory')}</span>
                            )}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">{t('attachments.noCategory')}</SelectItem>
                          {ATTACHMENT_CATEGORIES.map((cat) => (
                            <SelectItem key={cat.value} value={cat.value}>
                              {cat.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      attachment.category ? (
                        <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', getCategoryColor(attachment.category))}>
                          {getCategoryLabel(attachment.category)}
                        </span>
                      ) : null
                    )}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-right text-sm text-gray-500">
                    {formatFileSize(attachment.fileSize)}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                    {attachment.uploadedByName || '-'}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                    {formatDateTime(attachment.uploadedAt)}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-right">
                    {!isSynthetic && attachment.contentType === 'application/pdf' && (
                      <button
                        onClick={() => setAnalyzingAttachmentId(attachment.id)}
                        className="mr-2 text-gray-400 hover:text-purple-600"
                        title={t('pdfAnalysis.analyzeButton')}
                        data-testid={`analyze-attachment-${attachment.id}`}
                      >
                        <Scan className="h-4 w-4" />
                      </button>
                    )}
                    {isPreviewable(attachment.contentType) && (
                      <button
                        onClick={() => handlePreview(attachment)}
                        className="mr-2 text-gray-400 hover:text-blue-600"
                        title={t('attachments.preview')}
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                    )}
                    {!isSynthetic && (
                      <button
                        onClick={() => handleCopyPermalink(attachment.id)}
                        className="mr-2 text-gray-400 hover:text-blue-600"
                        title={copiedId === attachment.id ? t('attachments.linkCopied') : t('attachments.copyLink')}
                      >
                        {copiedId === attachment.id ? (
                          <Check className="h-4 w-4 text-green-500" />
                        ) : (
                          <Link2 className="h-4 w-4" />
                        )}
                      </button>
                    )}
                    <button
                      onClick={() => handleDownload(attachment)}
                      className="mr-2 text-gray-400 hover:text-blue-600"
                      title={t('attachments.download')}
                    >
                      <Download className="h-4 w-4" />
                    </button>
                    {canEdit && !isSynthetic && (
                      <button
                        onClick={() => handleDelete(attachment)}
                        className="text-gray-400 hover:text-red-600"
                        title={t('attachments.delete')}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </td>
                </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* PDF Analysis Panel */}
      {analyzingAttachmentId && (
        <div className="mt-6">
          <PdfAnalysisPanel
            contractId={contractId}
            attachmentId={analyzingAttachmentId}
            onClose={() => setAnalyzingAttachmentId(null)}
            onImported={() => {
              setAnalyzingAttachmentId(null)
              onRefetch()
            }}
          />
        </div>
      )}

      {/* Links Section */}
      <div className="mt-8">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Link2 className="h-5 w-5 text-gray-400" />
            <h3 className="text-lg font-semibold">{t('links.title')}</h3>
          </div>
          {canEdit && !showAddLink && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAddLink(true)}
            >
              <Plus className="h-4 w-4 mr-1" />
              {t('links.addLink')}
            </Button>
          )}
        </div>

        {/* Add Link Form */}
        {showAddLink && (
          <div className="mb-4 rounded-lg border bg-white p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">{t('links.name')}</label>
                <Input
                  placeholder={t('links.namePlaceholder')}
                  value={linkName}
                  onChange={(e) => setLinkName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{t('links.url')}</label>
                <Input
                  placeholder={t('links.urlPlaceholder')}
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                />
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowAddLink(false)
                  setLinkName('')
                  setLinkUrl('')
                  setError(null)
                }}
              >
                {t('common.cancel')}
              </Button>
              <Button
                size="sm"
                onClick={handleAddLink}
                disabled={addingLink || !linkName.trim() || !linkUrl.trim()}
              >
                {addingLink && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {t('common.save')}
              </Button>
            </div>
          </div>
        )}

        {/* Links List */}
        {links.length === 0 ? (
          <div className="rounded-lg border bg-white p-8 text-center">
            <Link2 className="mx-auto h-12 w-12 text-gray-400" />
            <p className="mt-2 text-gray-600">{t('links.noLinks')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    {t('links.name')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    {t('links.url')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    {t('links.createdBy')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    {t('links.createdAt')}
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                    {/* Actions */}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {links.map((link) => (
                  <tr key={link.id}>
                    <td className="px-6 py-4">
                      <span className="font-medium text-gray-900">{link.name}</span>
                    </td>
                    <td className="px-6 py-4">
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-red-600 hover:text-red-800"
                      >
                        <ExternalLink className="h-3 w-3" />
                        {link.url.length > 50 ? `${link.url.substring(0, 50)}...` : link.url}
                      </a>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                      {link.createdByName || '-'}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                      {formatDateTime(link.createdAt)}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-right">
                      {canEdit && (
                        <button
                          onClick={() => handleDeleteLink(link)}
                          className="text-gray-400 hover:text-red-600"
                          title={t('links.delete')}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
