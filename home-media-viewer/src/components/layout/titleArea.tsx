const TitleArea = (props: { title?: string }) => {
    return (
        <div className="titleArea">
            {props?.title ?? 'Home media viewer'}
        </div>);
}

export default TitleArea;