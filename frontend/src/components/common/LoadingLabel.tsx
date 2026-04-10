interface LoadingLabelProps {
  message?: string
}

export function LoadingLabel({ message = 'LOADING_DATA...' }: LoadingLabelProps) {
  return <div className="label">{message}</div>
}
