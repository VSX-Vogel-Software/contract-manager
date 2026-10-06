import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, gql } from '@apollo/client'
import { formatDate } from '@/lib/utils'
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  closestCorners,
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { useDroppable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { HelpVideoButton } from '@/components/HelpVideoButton'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Calendar,
  MessageSquare,
  Pencil,
  Search,
  GripVertical,
  ChevronDown,
  ChevronRight,
  ArrowRightLeft,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/auth'
import { TodoDetailModal } from './TodoDetailModal'

// ============================================================================
// GraphQL Queries and Mutations
// ============================================================================

const TODOS_BY_ASSIGNEE = gql`
  query TodosByAssignee($includeCompleted: Boolean) {
    todosByAssignee(includeCompleted: $includeCompleted) {
      assigneeId
      assigneeName
      isCurrentUser
      todos {
        id
        text
        reminderDate
        isPublic
        isCompleted
        completedAt
        entityType
        entityName
        entityId
        createdById
        createdByName
        assignedToId
        assignedToName
        contractId
        contractItemId
        customerId
        commentCount
      }
    }
  }
`

const UPDATE_TODO = gql`
  mutation UpdateTodoBoard(
    $todoId: Int!
    $text: String
    $reminderDate: Date
    $isPublic: Boolean
    $isCompleted: Boolean
    $assignedToId: Int
  ) {
    updateTodo(
      todoId: $todoId
      text: $text
      reminderDate: $reminderDate
      isPublic: $isPublic
      isCompleted: $isCompleted
      assignedToId: $assignedToId
    ) {
      success
      error
      todo {
        id
        text
        reminderDate
        isPublic
        isCompleted
        assignedToId
        assignedToName
      }
    }
  }
`

// ============================================================================
// Types
// ============================================================================

interface TodoItem {
  id: number
  text: string
  reminderDate: string | null
  isPublic: boolean
  isCompleted: boolean
  completedAt: string | null
  entityType: string
  entityName: string
  entityId: number
  createdById: number
  createdByName: string
  assignedToId: number | null
  assignedToName: string | null
  contractId: number | null
  contractItemId: number | null
  customerId: number | null
  commentCount: number
}

interface AssigneeColumn {
  assigneeId: number | null
  assigneeName: string
  isCurrentUser: boolean
  todos: TodoItem[]
}

// ============================================================================
// TodoCard Component (Draggable)
// ============================================================================

/** Ziel fuer "Verschieben" ohne Ziehen (eine Spalte = ein Zustaendiger) */
interface MoveTarget {
  assigneeId: number | null
  label: string
}

interface TodoCardProps {
  todo: TodoItem
  currentUserId: number
  onToggleComplete: (todo: TodoItem) => void
  onEdit: (todo: TodoItem) => void
  onViewComments: (todo: TodoItem) => void
  isDragging?: boolean
  /** Spalten, in die die Karte verschoben werden kann (ohne die eigene) */
  moveTargets?: MoveTarget[]
  onMove?: (todo: TodoItem, assigneeId: number | null) => void
}

/**
 * Verschieben in eine andere Spalte ohne Drag & Drop. Nur auf Touch-Geraeten
 * sichtbar - dort ist Ziehen muehsam bzw. kollidiert mit dem Scrollen; mit der
 * Maus bleibt die Karte wie bisher.
 */
function MoveTodoMenu({
  todo,
  targets,
  onMove,
}: {
  todo: TodoItem
  targets: MoveTarget[]
  onMove: (todo: TodoItem, assigneeId: number | null) => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  if (targets.length === 0) return null
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="hidden h-6 w-6 text-muted-foreground hover:text-primary touch:inline-flex touch:h-9 touch:w-9"
          aria-label={t('todos.assignTo')}
          data-testid={`todo-card-move-${todo.id}`}
        >
          <ArrowRightLeft className="h-3 w-3 touch:h-4 touch:w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-1" data-testid={`todo-card-move-menu-${todo.id}`}>
        <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">{t('todos.assignTo')}</p>
        {targets.map((target) => (
          <button
            key={target.assigneeId ?? 'unassigned'}
            type="button"
            className="flex w-full items-center rounded-sm px-2 py-2.5 text-left text-sm hover:bg-accent"
            data-testid={`todo-card-move-to-${target.assigneeId ?? 'unassigned'}`}
            onClick={() => {
              setOpen(false)
              onMove(todo, target.assigneeId)
            }}
          >
            {target.label}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  )
}

function TodoCard({
  todo,
  currentUserId,
  onToggleComplete,
  onEdit,
  onViewComments,
  isDragging,
  moveTargets,
  onMove,
}: TodoCardProps) {
  const getEntityLink = (todo: TodoItem): string => {
    if (todo.contractId) {
      return `/contracts/${todo.contractId}`
    }
    if (todo.customerId) {
      return `/customers/${todo.customerId}`
    }
    return '#'
  }


  const canEdit = todo.createdById === currentUserId

  return (
    <div
      className={cn(
        'rounded-lg border bg-white p-3 shadow-sm',
        todo.isCompleted && 'opacity-60',
        isDragging && 'opacity-50'
      )}
      data-testid={`todo-card-${todo.id}`}
    >
      {/* Header with checkbox and actions */}
      <div className="flex items-start gap-2">
        <Checkbox
          checked={todo.isCompleted}
          onCheckedChange={() => onToggleComplete(todo)}
          className="mt-0.5"
          data-testid={`todo-card-checkbox-${todo.id}`}
        />
        <div className="flex-1 min-w-0">
          <p
            className={cn(
              'text-sm cursor-pointer hover:text-primary',
              todo.isCompleted && 'line-through text-muted-foreground'
            )}
            onClick={() => onViewComments(todo)}
          >
            {todo.text}
          </p>
        </div>
        <div className="flex gap-1 shrink-0">
          {moveTargets && onMove && (
            <MoveTodoMenu todo={todo} targets={moveTargets} onMove={onMove} />
          )}
          {canEdit && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-primary touch:h-9 touch:w-9"
              onClick={() => onEdit(todo)}
              data-testid={`todo-card-edit-${todo.id}`}
            >
              <Pencil className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>

      {/* Entity link */}
      <div className="mt-1 text-xs text-muted-foreground truncate">
        <Link
          to={getEntityLink(todo)}
          className="hover:text-primary hover:underline"
        >
          {todo.entityName}
        </Link>
      </div>

      {/* Date & comment count */}
      <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
        {todo.reminderDate && (
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {formatDate(todo.reminderDate)}
          </span>
        )}

        <button
          onClick={() => onViewComments(todo)}
          className="flex items-center gap-1 hover:text-primary"
        >
          <MessageSquare className="h-3 w-3" />
          {todo.commentCount}
        </button>
      </div>
    </div>
  )
}

// ============================================================================
// SortableTodoCard Component (for drag-drop)
// ============================================================================

interface SortableTodoCardProps extends TodoCardProps {
  id: string
}

function SortableTodoCard({ id, ...props }: SortableTodoCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div ref={setNodeRef} style={style} className="relative group">
      <div
        {...attributes}
        {...listeners}
        className="absolute left-0 top-0 bottom-0 w-6 flex items-center justify-center cursor-grab opacity-0 group-hover:opacity-100 touch:opacity-100 transition-opacity touch-none"
      >
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="pl-4">
        <TodoCard {...props} isDragging={isDragging} />
      </div>
    </div>
  )
}

// ============================================================================
// BoardColumn Component
// ============================================================================

interface BoardColumnProps {
  column: AssigneeColumn
  columns: AssigneeColumn[]
  onMove: (todo: TodoItem, assigneeId: number | null) => void
  currentUserId: number
  onToggleComplete: (todo: TodoItem) => void
  onEdit: (todo: TodoItem) => void
  onViewComments: (todo: TodoItem) => void
  searchFilter: string
}

function BoardColumn({
  column,
  columns,
  onMove,
  currentUserId,
  onToggleComplete,
  onEdit,
  onViewComments,
  searchFilter,
}: BoardColumnProps) {
  const { t } = useTranslation()
  const [collapsed, setCollapsed] = useState(false)

  const columnId = column.assigneeId != null ? `column-${column.assigneeId}` : 'column-unassigned'
  const { setNodeRef, isOver } = useDroppable({ id: columnId })

  // Filter todos by search
  const filteredTodos = useMemo(() => {
    if (!searchFilter) return column.todos
    const search = searchFilter.toLowerCase()
    return column.todos.filter(
      (todo) =>
        todo.text.toLowerCase().includes(search) ||
        todo.entityName.toLowerCase().includes(search)
    )
  }, [column.todos, searchFilter])

  const todoIds = filteredTodos.map((t) => `todo-${t.id}`)

  const moveTargets: MoveTarget[] = columns
    .filter((c) => c.assigneeId !== column.assigneeId)
    .map((c) => ({ assigneeId: c.assigneeId, label: c.isCurrentUser ? t('todos.me') : c.assigneeName }))

  return (
    <div
      ref={setNodeRef}
      className={cn(
        // Telefon: Spalte fast bildschirmbreit, Spalten rasten beim Wischen ein
        'flex flex-col bg-gray-50 rounded-lg w-[calc(100vw-3rem)] max-w-[320px] shrink-0 snap-start sm:w-80 sm:min-w-[320px] max-h-full transition-colors',
        isOver && 'bg-blue-50 ring-2 ring-blue-200'
      )}
      data-testid={`todo-column-${column.assigneeId ?? 'unassigned'}`}
    >
      {/* Column header */}
      <div
        className="flex items-center justify-between p-3 border-b bg-gray-100 rounded-t-lg cursor-pointer"
        onClick={() => setCollapsed(!collapsed)}
      >
        <div className="flex items-center gap-2">
          {collapsed ? (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
          <h3 className="font-medium text-sm">
            {column.isCurrentUser ? t('todos.me') : column.assigneeName}
          </h3>
          <Badge variant="secondary" className="text-xs">
            {filteredTodos.length}
          </Badge>
        </div>
      </div>

      {/* Column content */}
      {!collapsed && (
        <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-[60px]">
          <SortableContext items={todoIds} strategy={verticalListSortingStrategy}>
            {filteredTodos.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-4">
                {t('todos.noTodos')}
              </p>
            ) : (
              filteredTodos.map((todo) => (
                <SortableTodoCard
                  key={todo.id}
                  id={`todo-${todo.id}`}
                  todo={todo}
                  currentUserId={currentUserId}
                  onToggleComplete={onToggleComplete}
                  onEdit={onEdit}
                  onViewComments={onViewComments}
                  moveTargets={moveTargets}
                  onMove={onMove}
                />
              ))
            )}
          </SortableContext>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Main TodoBoard Component
// ============================================================================

export function TodoBoard() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const currentUserId = user?.id ?? 0

  // State
  const [showCompleted, setShowCompleted] = useState(false)
  const [searchFilter, setSearchFilter] = useState('')
  const [detailTodoId, setDetailTodoId] = useState<number | null>(null)
  const [detailCanEdit, setDetailCanEdit] = useState(false)
  const [detailCanReassign, setDetailCanReassign] = useState(false)
  const [activeDragId, setActiveDragId] = useState<string | null>(null)

  // Queries
  const { data, loading, refetch } = useQuery(TODOS_BY_ASSIGNEE, {
    variables: { includeCompleted: showCompleted },
    fetchPolicy: 'cache-and-network',
  })

  // Mutations
  const [updateTodo] = useMutation(UPDATE_TODO)
  // DnD sensors: Maus wie bisher; auf Touch erst nach kurzem Halten, damit
  // Wischen weiter scrollt (MouseSensor statt PointerSensor, sonst greifen
  // beide bei Touch)
  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 8 },
    })
  )

  const columns: AssigneeColumn[] = data?.todosByAssignee || []

  // Find a todo by id across all columns
  const findTodoById = (id: number): TodoItem | null => {
    for (const col of columns) {
      const todo = col.todos.find((t) => t.id === id)
      if (todo) return todo
    }
    return null
  }

  // Handlers
  const handleToggleComplete = async (todo: TodoItem) => {
    try {
      await updateTodo({
        variables: {
          todoId: todo.id,
          isCompleted: !todo.isCompleted,
        },
      })
      refetch()
    } catch (error) {
      console.error('Failed to update todo:', error)
    }
  }

  // Zustaendigen wechseln (= Spalte), gemeinsam fuer Drag & Drop und Menue
  const moveTodo = async (todo: TodoItem, targetAssigneeId: number | null) => {
    if (targetAssigneeId === todo.assignedToId) return
    try {
      await updateTodo({
        variables: {
          todoId: todo.id,
          assignedToId: targetAssigneeId,
        },
      })
      refetch()
    } catch (error) {
      console.error('Failed to reassign todo:', error)
    }
  }

  // Drag handlers
  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragId(event.active.id as string)
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveDragId(null)

    const { active, over } = event
    if (!over) return

    // Extract todo ID from the draggable ID
    const todoId = parseInt((active.id as string).replace('todo-', ''))
    const todo = findTodoById(todoId)
    if (!todo) return

    // Determine target column (assignee)
    // The over could be a todo or a column droppable
    const overId = over.id as string
    let targetAssigneeId: number | null = null

    if (overId.startsWith('todo-')) {
      // Dropped over another todo - find which column it's in
      const overTodoId = parseInt(overId.replace('todo-', ''))
      for (const col of columns) {
        if (col.todos.find((t) => t.id === overTodoId)) {
          targetAssigneeId = col.assigneeId
          break
        }
      }
    } else if (overId.startsWith('column-')) {
      // Dropped directly on column
      targetAssigneeId = overId === 'column-unassigned' ? null : parseInt(overId.replace('column-', ''))
    }

    await moveTodo(todo, targetAssigneeId)
  }

  // Get dragged todo for overlay
  const activeTodo = activeDragId
    ? findTodoById(parseInt(activeDragId.replace('todo-', '')))
    : null

  if (loading && !data) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">{t('common.loading')}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex flex-col gap-3 mb-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">{t('todos.board')}</h1>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {/* Search */}
          <div className="relative w-full sm:w-auto">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder={t('common.search')}
              className="pl-9 w-full sm:w-64"
            />
          </div>

          {/* Show completed toggle */}
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={showCompleted}
              onCheckedChange={(checked) => setShowCompleted(checked === true)}
            />
            {t('todos.showCompleted')}
          </label>
          <HelpVideoButton />
        </div>
      </div>

      {/* Board */}
      <div className="flex-1 overflow-x-auto snap-x snap-mandatory -mx-3 px-3 py-2 sm:mx-0 sm:p-4 sm:snap-none">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="flex gap-4 h-full">
            {columns.map((column) => (
              <BoardColumn
                key={column.assigneeId ?? 'unassigned'}
                column={column}
                columns={columns}
                onMove={moveTodo}
                currentUserId={currentUserId}
                onToggleComplete={handleToggleComplete}
                onEdit={(todo) => { setDetailTodoId(todo.id); setDetailCanEdit(true); setDetailCanReassign(true) }}
                onViewComments={(todo) => { setDetailTodoId(todo.id); setDetailCanEdit(todo.createdById === currentUserId); setDetailCanReassign(todo.assignedToId === currentUserId) }}
                searchFilter={searchFilter}
              />
            ))}
          </div>

          {/* Drag overlay */}
          <DragOverlay>
            {activeTodo && (
              <div className="w-72">
                <TodoCard
                  todo={activeTodo}
                  currentUserId={currentUserId}
                  onToggleComplete={() => {}}
                  onEdit={() => {}}
                  onViewComments={() => {}}
                  isDragging
                />
              </div>
            )}
          </DragOverlay>
        </DndContext>
      </div>

      {/* Detail Modal (edit + comments) */}
      <TodoDetailModal
        todoId={detailTodoId}
        open={detailTodoId !== null}
        onOpenChange={(open) => { if (!open) setDetailTodoId(null) }}
        canEdit={detailCanEdit}
        canReassign={detailCanReassign}
        onRefresh={refetch}
      />
    </div>
  )
}
